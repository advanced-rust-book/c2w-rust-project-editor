importScripts(new URL("../src/browser_wasi_shim/index.js", location.href).href);
importScripts(new URL("../src/browser_wasi_shim/wasi_defs.js", location.href).href);
importScripts(new URL("./worker-util.js", location.href).href);
importScripts(new URL("./wasi-util.js", location.href).href);

const STACK_ERRNO_INVAL = 28;
type StackWorkerLogLevel = "info" | "warn" | "error";
type StackWorkerLogFacts = Record<string, string | number | boolean>;

const STACK_DEBUG = stackWorkerFlag("stackDebug", false);
const STACK_STDIO_LOG = stackWorkerFlag("stackLog", true);

onmessage = (msg: MessageEvent<unknown>): void => {
    serveIfInitMsg(msg);

    const fds: Array<unknown | undefined> = [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
    ];

    const certfd = 3;
    const listenfd = 4;
    const args = ["arg0", "--certfd=" + certfd, "--net-listenfd=" + listenfd];
    if (STACK_DEBUG) {
        args.push("--debug");
    }
    logStackWorkerEvent("info", "stack.worker.start", { certfd, listenfd, debug: STACK_DEBUG });
    const env: string[] = [];
    const wasi = new WASI(args, env, fds);

    wasiHackStack(wasi, certfd, 5);
    wasiHackSocket(wasi, listenfd, 5);

    fetch(getImagename(), { credentials: "same-origin" })
        .then((resp) => {
            if (!resp.ok) {
                throw new Error("failed to fetch stack image: HTTP " + resp.status);
            }
            return resp.arrayBuffer();
        })
        .then((wasm) => WebAssembly.instantiate(wasm, {
            wasi_snapshot_preview1: wasi.wasiImport,
            env: envHackStack(wasi),
        }))
        .then((inst) => {
            wasi.start(inst.instance);
        })
        .catch((error: unknown) => {
            logStackWorkerEvent("error", "stack.worker.start_failed", {
                message: error instanceof Error ? error.message : String(error),
            });
        });
};

function stackWorkerFlag(name: string, defaultValue: boolean): boolean {
    const raw = new URLSearchParams(location.search).get(name);
    if (raw === null) {
        return defaultValue;
    }
    return /^(1|true|yes|on)$/i.test(raw);
}

function logStackWorkerEvent(level: StackWorkerLogLevel, type: string, facts: StackWorkerLogFacts = {}): void {
    const payload = { type, ...facts };
    if (level === "error") {
        console.error("[container2wasm-stack]", payload);
    } else if (level === "warn") {
        console.warn("[container2wasm-stack]", payload);
    } else {
        console.info("[container2wasm-stack]", payload);
    }
}

function summarizeStackBytes(buf: Uint8Array): string {
    const text = new TextDecoder()
        .decode(buf)
        .replace(/\s+/g, " ")
        .trim();
    if (text.length <= 240) {
        return text;
    }
    return text.slice(0, 237) + "...";
}

function wasiHackStack(wasi: WASI, certfd: number, connfd: number): void {
    let certbuf: Uint8Array = new Uint8Array(0);

    const originalFdClose = wasi.wasiImport.fd_close;
    wasi.wasiImport.fd_close = (fd: number) => {
        if (fd === certfd) {
            sendCert(certbuf);
            return 0;
        }
        return originalFdClose.apply(wasi.wasiImport, [fd]);
    };

    const originalFdstatGet = wasi.wasiImport.fd_fdstat_get;
    wasi.wasiImport.fd_fdstat_get = (fd: number, fdstatPtr: number) => {
        if (fd === certfd) {
            const view = new DataView(wasi.inst.exports.memory.buffer);
            view.setUint8(fdstatPtr, 4);
            view.setUint16(fdstatPtr + 2, 0, true);
            view.setBigUint64(fdstatPtr + 8, 0n, true);
            view.setBigUint64(fdstatPtr + 16, 0n, true);
            return 0;
        }
        return originalFdstatGet.apply(wasi.wasiImport, [fd, fdstatPtr]);
    };

    wasi.wasiImport.fd_fdstat_set_flags = (_fd: number, _fdflags: number) => 0;

    const originalFdWrite = wasi.wasiImport.fd_write;
    wasi.wasiImport.fd_write = (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
        if (fd === 1 || fd === 2 || fd === certfd) {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
            const iovecs = Ciovec.read_bytes_array(buffer, iovsPtr, iovsLen);
            let wtotal = 0;

            for (const iovec of iovecs) {
                const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
                if (buf.length === 0) {
                    continue;
                }
                if (fd === certfd) {
                    certbuf = appendWorkerData(certbuf, buf);
                    wtotal += buf.length;
                    continue;
                }
                if (STACK_STDIO_LOG) {
                    const message = summarizeStackBytes(buf);
                    if (message) {
                        logStackWorkerEvent(fd === 1 ? "info" : "warn", "stack.worker.stdio", {
                            fd,
                            bytes: buf.length,
                            message,
                        });
                    }
                }
                wtotal += buf.length;
            }

            buffer.setUint32(nwrittenPtr, wtotal, true);
            return 0;
        }

        logStackWorkerEvent("warn", "stack.worker.fd_write_unknown", { fd });
        return originalFdWrite.apply(wasi.wasiImport, [fd, iovsPtr, iovsLen, nwrittenPtr]);
    };

    wasi.wasiImport.poll_oneoff = (inPtr: number, outPtr: number, nsubscriptions: number, neventsPtr: number) => {
        if (nsubscriptions === 0) {
            return STACK_ERRNO_INVAL;
        }

        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        const subscriptions = Subscription.read_bytes_array(buffer, inPtr, nsubscriptions);
        let isReadPollConn = false;
        let isClockPoll = false;
        let pollSubConn: Subscription | undefined;
        let clockSub: Subscription | undefined;
        let timeout = Number.MAX_VALUE;

        for (const sub of subscriptions) {
            if (sub.u.tag.variant === "fd_read") {
                const fd = (sub.u.data as SubscriptionFdReadWrite).fd;
                if (fd !== 0 && fd !== connfd) {
                    return STACK_ERRNO_INVAL;
                }
                if (fd === connfd) {
                    isReadPollConn = true;
                    pollSubConn = sub;
                }
            } else if (sub.u.tag.variant === "clock") {
                const clock = sub.u.data as SubscriptionClock;
                if (clock.timeout < timeout) {
                    timeout = clock.timeout;
                    isClockPoll = true;
                    clockSub = sub;
                }
            } else {
                return STACK_ERRNO_INVAL;
            }
        }

        const events: WasiEvent[] = [];
        if (isReadPollConn || isClockPoll) {
            const sockreadable = sockWaitForReadable(timeout / 1000000000);
            if (isReadPollConn) {
                if (sockreadable === errStatus) {
                    return STACK_ERRNO_INVAL;
                }
                if (sockreadable === true && pollSubConn) {
                    events.push(makeWasiEvent(pollSubConn.userdata, "fd_read"));
                }
            }
            if (isClockPoll && clockSub) {
                events.push(makeWasiEvent(clockSub.userdata, "clock"));
            }
        }

        WasiEvent.write_bytes_array(buffer, outPtr, events);
        buffer.setUint32(neventsPtr, events.length, true);
        return 0;
    };
}

function envHackStack(wasi: WASI): Record<string, (...args: number[]) => number> {
    return {
        http_send(addressP: number, addresslen: number, reqP: number, reqlen: number, idP: number): number {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            const address = new Uint8Array(wasi.inst.exports.memory.buffer, addressP, addresslen).slice();
            const req = new Uint8Array(wasi.inst.exports.memory.buffer, reqP, reqlen).slice();

            streamCtrl[0] = 0;
            postMessage({ type: "http_send", address, req });
            Atomics.wait(streamCtrl, 0, 0);

            if (streamStatus[0] < 0) {
                return STACK_ERRNO_INVAL;
            }

            buffer.setUint32(idP, streamStatus[0], true);
            return 0;
        },

        http_writebody(id: number, bodyP: number, bodylen: number, nwrittenP: number, isEOF: number): number {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            const body = new Uint8Array(wasi.inst.exports.memory.buffer, bodyP, bodylen).slice();

            streamCtrl[0] = 0;
            postMessage({ type: "http_writebody", id, body, isEOF });
            Atomics.wait(streamCtrl, 0, 0);

            if (streamStatus[0] < 0) {
                return STACK_ERRNO_INVAL;
            }

            buffer.setUint32(nwrittenP, bodylen, true);
            return 0;
        },

        http_isreadable(id: number, isOKP: number): number {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);

            streamCtrl[0] = 0;
            postMessage({ type: "http_isreadable", id });
            Atomics.wait(streamCtrl, 0, 0);

            if (streamStatus[0] < 0) {
                return STACK_ERRNO_INVAL;
            }

            buffer.setUint32(isOKP, streamData[0] === 1 ? 1 : 0, true);
            return 0;
        },

        http_recv(id: number, respP: number, bufsize: number, respsizeP: number, isEOFP: number): number {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);

            streamCtrl[0] = 0;
            postMessage({ type: "http_recv", id, len: bufsize });
            Atomics.wait(streamCtrl, 0, 0);

            if (streamStatus[0] < 0) {
                return STACK_ERRNO_INVAL;
            }

            const ddlen = streamLen[0];
            buffer8.set(streamData.slice(0, ddlen), respP);
            buffer.setUint32(respsizeP, ddlen, true);
            buffer.setUint32(isEOFP, streamStatus[0] === 1 ? 1 : 0, true);
            return 0;
        },

        http_readbody(id: number, bodyP: number, bufsize: number, bodysizeP: number, isEOFP: number): number {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);

            streamCtrl[0] = 0;
            postMessage({ type: "http_readbody", id, len: bufsize });
            Atomics.wait(streamCtrl, 0, 0);

            if (streamStatus[0] < 0) {
                return STACK_ERRNO_INVAL;
            }

            const ddlen = streamLen[0];
            buffer8.set(streamData.slice(0, ddlen), bodyP);
            buffer.setUint32(bodysizeP, ddlen, true);
            buffer.setUint32(isEOFP, streamStatus[0] === 1 ? 1 : 0, true);
            return 0;
        },
    };
}

function makeWasiEvent(userdata: bigint, variant: WasiEventVariant): WasiEvent {
    const event = new WasiEvent();
    event.userdata = userdata;
    event.error = 0;
    event.type = new WasiEventType(variant);
    return event;
}
