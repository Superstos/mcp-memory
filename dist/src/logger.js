const levelOrder = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};
export function createLogger(level) {
    const threshold = levelOrder[level] ?? levelOrder.info;
    const log = {
        debug: (message, meta) => write("debug", message, meta),
        info: (message, meta) => write("info", message, meta),
        warn: (message, meta) => write("warn", message, meta),
        error: (message, meta) => write("error", message, meta)
    };
    function write(lvl, message, meta) {
        if (levelOrder[lvl] < threshold)
            return;
        const payload = {
            ts: new Date().toISOString(),
            level: lvl,
            message,
            ...(meta ? { meta } : {})
        };
        const line = JSON.stringify(payload);
        if (lvl === "error") {
            console.error(line);
        }
        else {
            console.log(line);
        }
    }
    return log;
}
