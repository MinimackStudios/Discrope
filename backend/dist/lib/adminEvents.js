"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminEventsBus = void 0;
const node_events_1 = require("node:events");
const adminEvents = new node_events_1.EventEmitter();
adminEvents.setMaxListeners(100);
exports.adminEventsBus = {
    emit(event) {
        adminEvents.emit("event", event);
    },
    subscribe(listener) {
        adminEvents.on("event", listener);
        return () => adminEvents.off("event", listener);
    }
};
