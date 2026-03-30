const { app } = require('electron');

const isProduction = app.isPackaged;

module.exports = {
    debug: (...args) => {
        if (!isProduction) console.log(...args);
    },
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
};
