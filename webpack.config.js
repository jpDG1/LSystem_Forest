const path = require("path");

module.exports = {
    entry: "./src/index.ts", // 🎯 головний файл
    output: {
        filename: "bundle.js",
        path: path.resolve(__dirname, "dist")
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    devtool: "source-map", // для дебагу
    mode: "development",   // щоб не було warning
};
