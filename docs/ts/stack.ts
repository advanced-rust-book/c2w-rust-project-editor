interface StackByteBuffer {
    buf: Uint8Array;
}

interface StackConnection {
    sendbuf: StackByteBuffer;
    recvbuf: StackByteBuffer;
}

interface StackCertBuffer {
    buf: Uint8Array;
    done: boolean;
}

interface StackHttpConnection {
    address: string;
    request: RequestInit & { headers?: Record<string, string>; method?: string };
    requestSent: boolean;
    reqBodybuf: Uint8Array;
    reqBodyEOF: boolean;
    response?: Uint8Array;
    respBodybuf: Uint8Array;
    done: boolean;
}

type StackLogLevel = "info" | "warn" | "error";
type StackLogFacts = Record<string, string | number | boolean>;

function logStackEvent(level: StackLogLevel, type: string, facts: StackLogFacts = {}): void {
    const payload = { type, ...facts };
    if (level === "error") {
        console.error("[container2wasm-stack]", payload);
    } else if (level === "warn") {
        console.warn("[container2wasm-stack]", payload);
    } else {
        console.info("[container2wasm-stack]", payload);
    }
}

function stackErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isStackOutOfBandMessage(type: string): boolean {
    return type === "direct-fs-response";
}

function newStack(
    worker: Worker,
    workerImageNamePrefix: string,
    workerImageChunks: WasmImageChunks,
    stackWorker: Worker,
    stackImageName: string
): (event: MessageEvent<unknown>) => void {
    const p2vbuf: StackByteBuffer = {
        buf: new Uint8Array(0),
    };
    const v2pbuf: StackByteBuffer = {
        buf: new Uint8Array(0),
    };

    const proxyConn: StackConnection = {
        sendbuf: p2vbuf,
        recvbuf: v2pbuf,
    };
    const vmConn: StackConnection = {
        sendbuf: v2pbuf,
        recvbuf: p2vbuf,
    };

    const proxyShared = new SharedArrayBuffer(12 + 4096);
    const certbuf: StackCertBuffer = {
        buf: new Uint8Array(0),
        done: false,
    };

    stackWorker.onmessage = connectStack("proxy", proxyShared, proxyConn, certbuf);
    stackWorker.postMessage({ type: "init", buf: proxyShared, imagename: stackImageName });

    const vmShared = new SharedArrayBuffer(12 + 4096);
    worker.postMessage({ type: "init", buf: vmShared, imagename: workerImageNamePrefix, chunks: workerImageChunks });

    return connectStack("vm", vmShared, vmConn, certbuf);
}

function connectStack(
    name: string,
    shared: SharedArrayBuffer,
    conn: StackConnection,
    certbuf: StackCertBuffer
): (event: MessageEvent<unknown>) => void {
    const streamCtrlLocal = new Int32Array(shared, 0, 1);
    const streamStatusLocal = new Int32Array(shared, 4, 1);
    const streamLenLocal = new Int32Array(shared, 8, 1);
    const streamDataLocal = new Uint8Array(shared, 12);
    const sendbuf = conn.sendbuf;
    const recvbuf = conn.recvbuf;

    let accepted = false;
    let timeoutHandler: number | undefined;
    const httpConnections: Record<number, StackHttpConnection | undefined> = {};
    let curID = 0;
    const maxID = 0x7fffffff;

    function getID(): number {
        const startID = curID;
        while (true) {
            if (httpConnections[curID] === undefined) {
                return curID;
            }
            curID = curID >= maxID ? 0 : curID + 1;
            if (curID === startID) {
                return -1;
            }
        }
    }

    function serveData(data: Uint8Array, len?: number): Uint8Array {
        const requested = typeof len === "number" && Number.isFinite(len) && len >= 0
            ? Math.floor(len)
            : streamDataLocal.byteLength;
        const length = Math.min(requested, streamDataLocal.byteLength, data.byteLength);
        const buf = data.slice(0, length);
        const remain = data.slice(length);
        streamLenLocal[0] = buf.byteLength;
        streamDataLocal.set(buf, 0);
        return remain;
    }

    function notifyWaiter(): void {
        Atomics.store(streamCtrlLocal, 0, 1);
        Atomics.notify(streamCtrlLocal, 0);
    }

    return (msg: MessageEvent<unknown>): void => {
        const req = msg.data as Record<string, unknown>;
        if (typeof req !== "object" || req === null || typeof req.type !== "string") {
            logStackEvent("warn", "stack.message.unknown", { name, message: String(msg.data).slice(0, 160) });
            return;
        }
        if (isStackOutOfBandMessage(req.type)) {
            return;
        }

        switch (req.type) {
            case "accept":
                accepted = true;
                streamDataLocal[0] = 1;
                streamStatusLocal[0] = 0;
                break;

            case "send": {
                if (!accepted) {
                    logStackEvent("warn", "stack.socket.send_rejected", { name, reason: "socket is not accepted" });
                    streamStatusLocal[0] = -1;
                    break;
                }
                const data = req.buf instanceof Uint8Array ? req.buf : new Uint8Array(req.buf as ArrayBuffer);
                sendbuf.buf = appendStackData(sendbuf.buf, data);
                streamStatusLocal[0] = 0;
                break;
            }

            case "recv":
                if (!accepted) {
                    logStackEvent("warn", "stack.socket.recv_rejected", { name, reason: "socket is not accepted" });
                    streamStatusLocal[0] = -1;
                    break;
                }
                recvbuf.buf = serveData(recvbuf.buf, Number(req.len));
                streamStatusLocal[0] = 0;
                break;

            case "recv-is-readable":
                if (recvbuf.buf.byteLength > 0) {
                    streamDataLocal[0] = 1;
                } else if (typeof req.timeout === "number" && req.timeout > 0) {
                    if (timeoutHandler !== undefined) {
                        clearTimeout(timeoutHandler);
                    }
                    timeoutHandler = window.setTimeout(() => {
                        timeoutHandler = undefined;
                        streamDataLocal[0] = recvbuf.buf.byteLength > 0 ? 1 : 0;
                        streamStatusLocal[0] = 0;
                        notifyWaiter();
                    }, req.timeout * 1000);
                    return;
                } else {
                    streamDataLocal[0] = 0;
                }
                streamStatusLocal[0] = 0;
                break;

            case "http_send": {
                const reqBytes = req.req instanceof Uint8Array ? req.req : new Uint8Array(req.req as ArrayBuffer);
                const addressBytes = req.address instanceof Uint8Array
                    ? req.address
                    : new Uint8Array(req.address as ArrayBuffer);
                const request = JSON.parse(new TextDecoder().decode(reqBytes)) as RequestInit & {
                    headers?: Record<string, string>;
                    method?: string;
                };

                request.mode = "cors";
                request.credentials = "omit";
                if (request.headers && request.headers["User-Agent"] !== "") {
                    delete request.headers["User-Agent"];
                }

                const reqID = getID();
                if (reqID < 0) {
                    logStackEvent("warn", "stack.http.id_exhausted", { name });
                    streamStatusLocal[0] = -1;
                    break;
                }

                httpConnections[reqID] = {
                    address: new TextDecoder().decode(addressBytes),
                    request,
                    requestSent: false,
                    reqBodybuf: new Uint8Array(0),
                    reqBodyEOF: false,
                    respBodybuf: new Uint8Array(0),
                    done: false,
                };
                streamStatusLocal[0] = reqID;
                break;
            }

            case "http_writebody": {
                const id = Number(req.id);
                const connObj = httpConnections[id];
                if (!connObj) {
                    streamStatusLocal[0] = -1;
                    break;
                }

                const body = req.body instanceof Uint8Array ? req.body : new Uint8Array(req.body as ArrayBuffer);
                connObj.reqBodybuf = appendStackData(connObj.reqBodybuf, body);
                connObj.reqBodyEOF = Boolean(req.isEOF);
                streamStatusLocal[0] = 0;

                if (connObj.reqBodyEOF && !connObj.requestSent) {
                    connObj.requestSent = true;
                    const method = (connObj.request.method || "GET").toUpperCase();
                    if (method !== "HEAD" && method !== "GET") {
                        connObj.request.body = new Uint8Array(connObj.reqBodybuf);
                    }

                    fetch(connObj.address, connObj.request)
                        .then((resp) => {
                            connObj.response = new TextEncoder().encode(JSON.stringify({
                                bodyUsed: resp.bodyUsed,
                                headers: Object.fromEntries(resp.headers.entries()),
                                redirected: resp.redirected,
                                status: resp.status,
                                statusText: resp.statusText,
                                type: resp.type,
                                url: resp.url,
                            }));
                            connObj.done = false;
                            connObj.respBodybuf = new Uint8Array(0);

                            if (resp.ok) {
                                resp.arrayBuffer()
                                    .then((data) => {
                                        connObj.respBodybuf = new Uint8Array(data);
                                        connObj.done = true;
                                    })
                                    .catch((error: unknown) => {
                                        connObj.respBodybuf = new Uint8Array(0);
                                        connObj.done = true;
                                        logStackEvent("warn", "stack.http.body_failed", { name, message: stackErrorMessage(error) });
                                    });
                            } else {
                                connObj.done = true;
                            }
                        })
                        .catch((error: unknown) => {
                            logStackEvent("warn", "stack.http.fetch_failed", { name, address: connObj.address, message: stackErrorMessage(error) });
                            connObj.response = new TextEncoder().encode(JSON.stringify({
                                status: 503,
                                statusText: "Service Unavailable",
                            }));
                            connObj.respBodybuf = new Uint8Array(0);
                            connObj.done = true;
                        });
                }
                break;
            }

            case "http_isreadable": {
                const connObj = httpConnections[Number(req.id)];
                streamDataLocal[0] = connObj?.response !== undefined ? 1 : 0;
                streamStatusLocal[0] = 0;
                break;
            }

            case "http_recv": {
                const connObj = httpConnections[Number(req.id)];
                if (!connObj?.response) {
                    logStackEvent("warn", "stack.http.response_unavailable", { name, id: Number(req.id) });
                    streamStatusLocal[0] = -1;
                    break;
                }
                connObj.response = serveData(connObj.response, Number(req.len));
                streamStatusLocal[0] = connObj.response.byteLength === 0 ? 1 : 0;
                break;
            }

            case "http_readbody": {
                const connObj = httpConnections[Number(req.id)];
                if (!connObj?.response) {
                    logStackEvent("warn", "stack.http.body_unavailable", { name, id: Number(req.id) });
                    streamStatusLocal[0] = -1;
                    break;
                }
                connObj.respBodybuf = serveData(connObj.respBodybuf, Number(req.len));
                streamStatusLocal[0] = 0;
                if (connObj.done && connObj.respBodybuf.byteLength === 0) {
                    streamStatusLocal[0] = 1;
                    delete httpConnections[Number(req.id)];
                }
                break;
            }

            case "send_cert": {
                const data = req.buf instanceof Uint8Array ? req.buf : new Uint8Array(req.buf as ArrayBuffer);
                certbuf.buf = appendStackData(certbuf.buf, data);
                certbuf.done = true;
                streamStatusLocal[0] = 0;
                break;
            }

            case "recv_cert":
                if (!certbuf.done) {
                    streamStatusLocal[0] = -1;
                    break;
                }
                certbuf.buf = serveData(certbuf.buf, Number(req.len));
                streamStatusLocal[0] = certbuf.buf.byteLength === 0 ? 1 : 0;
                break;

            default:
                logStackEvent("warn", "stack.request.unknown", { name, requestType: req.type });
                streamStatusLocal[0] = -1;
                break;
        }

        notifyWaiter();
    };
}

function appendStackData(data1: Uint8Array, data2: ArrayBuffer | Uint8Array): Uint8Array {
    const right = data2 instanceof Uint8Array ? data2 : new Uint8Array(data2);
    const buf = new Uint8Array(data1.byteLength + right.byteLength);
    buf.set(data1, 0);
    buf.set(right, data1.byteLength);
    return buf;
}

window.newStack = newStack;
