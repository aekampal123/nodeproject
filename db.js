// db.js
const mysql = require("mysql2");
const fs = require("fs");
require("dotenv").config();

let db;

function handleDisconnect() {
    db = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: process.env.DB_PORT,
        connectTimeout: 30000,
        ssl: {
            rejectUnauthorized: true,
            ca: fs.readFileSync("ca.pem"), // Load SSL certificate
        },
    });

    db.connect((err) => {
        if (err) {
            console.error("❌ MySQL Connection Failed:", err);
            setTimeout(handleDisconnect, 5000); // Try reconnecting after 5 seconds
        } else {
            console.log("✅ Connected to MySQL Database");
        }
    });

    db.on("error", (err) => {
        console.error("⚠️ Database error:", err.message);
        if (err.code === "PROTOCOL_CONNECTION_LOST") {
            console.log("🔄 Reconnecting...");
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

// Initialize connection
handleDisconnect();

module.exports = db;
