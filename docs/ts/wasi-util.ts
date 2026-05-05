////////////////////////////////////////////////////////////
//
// event-related classes adopted from the on-going discussion
// towards poll_oneoff support in browser_wasi_sim project.
// Ref: https://github.com/bjorn3/browser_wasi_shim/issues/14#issuecomment-1450351935
//
////////////////////////////////////////////////////////////

class WasiEventType {
    readonly variant: WasiEventVariant;

    constructor(variant: WasiEventVariant) {
        this.variant = variant;
    }

    static from_u8(data: number): WasiEventType {
        switch (data) {
            case EVENTTYPE_CLOCK:
                return new WasiEventType("clock");
            case EVENTTYPE_FD_READ:
                return new WasiEventType("fd_read");
            case EVENTTYPE_FD_WRITE:
                return new WasiEventType("fd_write");
            default:
                throw new Error("Invalid event type " + String(data));
        }
    }

    to_u8(): number {
        switch (this.variant) {
            case "clock":
                return EVENTTYPE_CLOCK;
            case "fd_read":
                return EVENTTYPE_FD_READ;
            case "fd_write":
                return EVENTTYPE_FD_WRITE;
            default: {
                const unreachable: never = this.variant;
                throw new Error("unreachable event variant " + String(unreachable));
            }
        }
    }
}

class WasiEvent {
    userdata: bigint = 0n;
    error = 0;
    type: WasiEventType = new WasiEventType("clock");

    write_bytes(view: DataView, ptr: number): void {
        view.setBigUint64(ptr, this.userdata, true);
        view.setUint16(ptr + 8, this.error, true);
        view.setUint8(ptr + 10, this.type.to_u8());
    }

    static write_bytes_array(view: DataView, ptr: number, events: WasiEvent[]): void {
        for (let i = 0; i < events.length; i++) {
            events[i].write_bytes(view, ptr + 32 * i);
        }
    }
}

class SubscriptionClock {
    timeout = 0;

    static read_bytes(view: DataView, ptr: number): SubscriptionClock {
        const self = new SubscriptionClock();
        self.timeout = Number(view.getBigUint64(ptr + 8, true));
        return self;
    }
}

class SubscriptionFdReadWrite {
    fd = 0;

    static read_bytes(view: DataView, ptr: number): SubscriptionFdReadWrite {
        const self = new SubscriptionFdReadWrite();
        self.fd = view.getUint32(ptr, true);
        return self;
    }
}

class SubscriptionU {
    tag: WasiEventType = new WasiEventType("clock");
    data: SubscriptionClock | SubscriptionFdReadWrite = new SubscriptionClock();

    static read_bytes(view: DataView, ptr: number): SubscriptionU {
        const self = new SubscriptionU();
        self.tag = WasiEventType.from_u8(view.getUint8(ptr));
        switch (self.tag.variant) {
            case "clock":
                self.data = SubscriptionClock.read_bytes(view, ptr + 8);
                break;
            case "fd_read":
            case "fd_write":
                self.data = SubscriptionFdReadWrite.read_bytes(view, ptr + 8);
                break;
            default: {
                const unreachable: never = self.tag.variant;
                throw new Error("unreachable subscription variant " + String(unreachable));
            }
        }
        return self;
    }
}

class Subscription {
    userdata: bigint = 0n;
    u: SubscriptionU = new SubscriptionU();

    static read_bytes(view: DataView, ptr: number): Subscription {
        const subscription = new Subscription();
        subscription.userdata = view.getBigUint64(ptr, true);
        subscription.u = SubscriptionU.read_bytes(view, ptr + 8);
        return subscription;
    }

    static read_bytes_array(view: DataView, ptr: number, len: number): Subscription[] {
        const subscriptions: Subscription[] = [];
        for (let i = 0; i < len; i++) {
            subscriptions.push(Subscription.read_bytes(view, ptr + 48 * i));
        }
        return subscriptions;
    }
}

(globalThis as typeof globalThis & {
    WasiEventType: typeof WasiEventType;
    WasiEvent: typeof WasiEvent;
    Subscription: typeof Subscription;
}).WasiEventType = WasiEventType;

(globalThis as typeof globalThis & {
    WasiEventType: typeof WasiEventType;
    WasiEvent: typeof WasiEvent;
    Subscription: typeof Subscription;
}).WasiEvent = WasiEvent;

(globalThis as typeof globalThis & {
    WasiEventType: typeof WasiEventType;
    WasiEvent: typeof WasiEvent;
    Subscription: typeof Subscription;
}).Subscription = Subscription;
