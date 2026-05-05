let streamCtrl: Int32Array;
let streamStatus: Int32Array;
let streamLen: Int32Array;
let streamData: Uint8Array;

let imagename = "";
let numchunks: WasmImageChunks | undefined;

const errStatus = {
    val: 0,
};

function registerSocketBuffer(shared: SharedArrayBuffer): void {
    streamCtrl = new Int32Array(shared, 0, 1);
    streamStatus = new Int32Array(shared, 4, 1);
    streamLen = new Int32Array(shared, 8, 1);
    streamData = new Uint8Array(shared, 12);
}

function isInitWorkerMessage(value: unknown): value is InitWorkerMessage {
    return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "init";
}

function serveIfInitMsg(msg: MessageEvent<unknown>): boolean {
    const req = msg.data;
    if (!isInitWorkerMessage(req)) {
        return false;
    }

    if (req.buf) {
        registerSocketBuffer(req.buf);
    }
    if (req.imagename) {
        imagename = req.imagename;
    }
    numchunks = req.chunks;
    return true;
}

function getImagename(): string {
    return imagename;
}

function resolveChunkFiles(prefix: string, chunks: WasmImageChunks | undefined): string[] {
    if (Array.isArray(chunks)) {
        const base = prefix.substring(0, prefix.lastIndexOf("/") + 1);
        return chunks.map((file) => {
            if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(file) || file.startsWith("/")) {
                return file;
            }
            return base + file;
        });
    }

    const count = Number(chunks);
    if (!Number.isInteger(count) || count <= 0) {
        throw new Error("invalid wasm chunk count: " + String(chunks));
    }

    const files: string[] = [];
    for (let i = 0; i < count; i++) {
        let suffix = i.toString();
        while (suffix.length < 2) {
            suffix = "0" + suffix;
        }
        files.push(prefix + suffix + ".wasm");
    }
    return files;
}

function fetchChunks(callback: (wasm: ArrayBuffer) => void): void {
    const files = resolveChunkFiles(imagename, numchunks);
    const requests = files.map((file) => {
        return fetch(file, { cache: "no-store", credentials: "same-origin" })
            .then((resp) => {
                if (!resp.ok) {
                    throw new Error("failed to fetch " + file + ": HTTP " + resp.status);
                }
                return resp.arrayBuffer();
            });
    });

    Promise.all(requests)
        .then((buffers) => new Blob(buffers).arrayBuffer())
        .then(callback)
        .catch((error: unknown) => {
            console.error("failed to fetch wasm chunks:", error);
            throw error;
        });
}

function requireSocketBuffer(): void {
    if (!streamCtrl || !streamStatus || !streamLen || !streamData) {
        throw new Error("socket shared buffer is not registered");
    }
}

function sockAccept(): boolean {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "accept" });
    Atomics.wait(streamCtrl, 0, 0);
    return streamData[0] === 1;
}

function sockSend(data: ArrayBuffer | Uint8Array): typeof errStatus | undefined {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "send", buf: data });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    return undefined;
}

function sockRecv(len: number): Uint8Array | typeof errStatus {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "recv", len });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    const ddlen = streamLen[0];
    return streamData.slice(0, ddlen);
}

function sockWaitForReadable(timeout?: number): boolean | typeof errStatus {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "recv-is-readable", timeout });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    return streamData[0] === 1;
}

function sendCert(data: Uint8Array): typeof errStatus | undefined {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "send_cert", buf: data });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    return undefined;
}

function recvCert(): Promise<Uint8Array> {
    requireSocketBuffer();
    let buf: Uint8Array = new Uint8Array(0);

    return new Promise((resolve) => {
        const getCert = (): void => {
            streamCtrl[0] = 0;
            postMessage({ type: "recv_cert", len: streamData.byteLength });
            Atomics.wait(streamCtrl, 0, 0);

            if (streamStatus[0] < 0) {
                setTimeout(getCert, 100);
                return;
            }

            const ddlen = streamLen[0];
            buf = appendWorkerData(buf, streamData.slice(0, ddlen));

            if (streamStatus[0] === 1) {
                resolve(buf);
                return;
            }

            setTimeout(getCert, 0);
        };

        getCert();
    });
}

function appendWorkerData(data1: Uint8Array, data2: ArrayBuffer | Uint8Array): Uint8Array {
    const right = data2 instanceof Uint8Array ? data2 : new Uint8Array(data2);
    const buf = new Uint8Array(data1.byteLength + right.byteLength);
    buf.set(data1, 0);
    buf.set(right, data1.byteLength);
    return buf;
}

function getCertDir(cert: Uint8Array): WasiPreopenDirectory {
    const WasiFile = globalThis.File as unknown as WasiFileConstructor;
    const certDir = new PreopenDirectory("/.wasmenv", {
        "proxy.crt": new WasiFile(cert, {}),
    });

    const originalPathOpen = certDir.path_open;
    certDir.path_open = (dirflags, path, oflags, fsRightsBase, fsRightsInherited, fdflags) => {
        const ret = originalPathOpen.apply(certDir, [dirflags, path, oflags, fsRightsBase, fsRightsInherited, fdflags]);
        if (ret.fd_obj !== null) {
            const opened = ret.fd_obj;
            opened.fd_pread = (view8: Uint8Array, iovs: WasiIoVec[], offset: bigint | number): WasiReadResult => {
                const oldOffset = opened.file_pos;
                let seek = opened.fd_seek(offset, WHENCE_SET);
                if (seek.ret !== 0) {
                    return { ret: -1, nread: 0 };
                }

                const readRet = opened.fd_read(view8, iovs);
                seek = opened.fd_seek(oldOffset, WHENCE_SET);
                if (seek.ret !== 0) {
                    return { ret: -1, nread: 0 };
                }

                return readRet;
            };
        }
        return ret;
    };

    certDir.dir.contents["."] = certDir.dir;
    return certDir;
}

function wasiHackSocket(wasi: WASI, listenfd: number, connfd: number): void {
    const ERRNO_INVAL = 28;
    const ERRNO_AGAIN = 6;
    let connfdUsed = false;

    const originalFdClose = wasi.wasiImport.fd_close;
    wasi.wasiImport.fd_close = (fd: number) => {
        if (fd === connfd) {
            connfdUsed = false;
            return 0;
        }
        return originalFdClose.apply(wasi.wasiImport, [fd]);
    };

    const originalFdRead = wasi.wasiImport.fd_read;
    wasi.wasiImport.fd_read = (fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number) => {
        if (fd === connfd) {
            return wasi.wasiImport.sock_recv(fd, iovsPtr, iovsLen, 0, nreadPtr, 0);
        }
        return originalFdRead.apply(wasi.wasiImport, [fd, iovsPtr, iovsLen, nreadPtr]);
    };

    const originalFdWrite = wasi.wasiImport.fd_write;
    wasi.wasiImport.fd_write = (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
        if (fd === connfd) {
            return wasi.wasiImport.sock_send(fd, iovsPtr, iovsLen, 0, nwrittenPtr);
        }
        return originalFdWrite.apply(wasi.wasiImport, [fd, iovsPtr, iovsLen, nwrittenPtr]);
    };

    const originalFdstatGet = wasi.wasiImport.fd_fdstat_get;
    wasi.wasiImport.fd_fdstat_get = (fd: number, fdstatPtr: number) => {
        if (fd === listenfd || (fd === connfd && connfdUsed)) {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            buffer.setUint8(fdstatPtr, 6);
            buffer.setUint16(fdstatPtr + 2, FDFLAGS_NONBLOCK, true);
            buffer.setBigUint64(fdstatPtr + 8, 0n, true);
            buffer.setBigUint64(fdstatPtr + 16, 0n, true);
            return 0;
        }
        return originalFdstatGet.apply(wasi.wasiImport, [fd, fdstatPtr]);
    };

    wasi.wasiImport.sock_accept = (fd: number, _flags: number, fdPtr: number) => {
        if (fd !== listenfd) {
            console.log("sock_accept: unknown fd " + fd);
            return ERRNO_INVAL;
        }
        if (connfdUsed) {
            console.log("sock_accept: multi-connection is unsupported");
            return ERRNO_INVAL;
        }
        if (!sockAccept()) {
            return ERRNO_AGAIN;
        }
        connfdUsed = true;
        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        buffer.setUint32(fdPtr, connfd, true);
        return 0;
    };

    wasi.wasiImport.sock_send = (fd: number, iovsPtr: number, iovsLen: number, _siFlags: number, nwrittenPtr: number) => {
        if (fd !== connfd) {
            console.log("sock_send: unknown fd " + fd);
            return ERRNO_INVAL;
        }

        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
        const iovecs = Ciovec.read_bytes_array(buffer, iovsPtr, iovsLen);
        let wtotal = 0;

        for (const iovec of iovecs) {
            const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
            if (buf.length === 0) {
                continue;
            }
            const ret = sockSend(buf);
            if (ret === errStatus) {
                return ERRNO_INVAL;
            }
            wtotal += buf.length;
        }

        buffer.setUint32(nwrittenPtr, wtotal, true);
        return 0;
    };

    wasi.wasiImport.sock_recv = (
        fd: number,
        iovsPtr: number,
        iovsLen: number,
        riFlags: number,
        nreadPtr: number,
        roFlagsPtr: number
    ) => {
        if (riFlags !== 0) {
            console.log("ri_flags are unsupported");
        }
        if (fd !== connfd) {
            console.log("sock_recv: unknown fd " + fd);
            return ERRNO_INVAL;
        }

        const sockreadable = sockWaitForReadable();
        if (sockreadable === errStatus) {
            return ERRNO_INVAL;
        }
        if (sockreadable === false) {
            return ERRNO_AGAIN;
        }

        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
        const iovecs = Iovec.read_bytes_array(buffer, iovsPtr, iovsLen);
        let nread = 0;

        for (const iovec of iovecs) {
            if (iovec.buf_len === 0) {
                continue;
            }
            const data = sockRecv(iovec.buf_len);
            if (!(data instanceof Uint8Array)) {
                return ERRNO_INVAL;
            }
            buffer8.set(data, iovec.buf);
            nread += data.length;
            if (data.length < iovec.buf_len) {
                break;
            }
        }

        buffer.setUint32(nreadPtr, nread, true);
        if (roFlagsPtr !== 0) {
            buffer.setUint16(roFlagsPtr, 0, true);
        }
        return 0;
    };

    wasi.wasiImport.sock_shutdown = (fd: number, _sdflags: number) => {
        if (fd === connfd) {
            connfdUsed = false;
        }
        return 0;
    };
}
