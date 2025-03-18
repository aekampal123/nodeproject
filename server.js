const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// ✅ MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err);
    return;
  }
  console.log("✅ Connected to MySQL Database");
});

// ============================================
// 👤 USERS API
// ============================================
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.query(
    "INSERT INTO users (email, password) VALUES (?, ?)",
    [email, hashedPassword],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "User registered successfully", id: result.insertId });
    }
  );
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ message: "Invalid credentials" });
    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });
    res.json({ message: "Login successful", user });
  });
});

// ============================================
// 📦 INVENTORY API
// ============================================
app.get("/inventory", (req, res) => {
  db.query("SELECT * FROM inventory", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post("/inventory", (req, res) => {
  const { product_name, stock_quantity, reorder_threshold, price } = req.body;
  db.query(
    "INSERT INTO inventory (product_name, stock_quantity, reorder_threshold, price) VALUES (?, ?, ?, ?)",
    [product_name, stock_quantity, reorder_threshold, price],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Inventory item added", id: result.insertId });
    }
  );
});

app.put("/inventory/:id", (req, res) => {
  const { id } = req.params;
  const { product_name, stock_quantity, reorder_threshold, price } = req.body;
  db.query(
    "UPDATE inventory SET product_name=?, stock_quantity=?, reorder_threshold=?, price=? WHERE id=?",
    [product_name, stock_quantity, reorder_threshold, price, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Inventory item updated" });
    }
  );
});

app.delete("/inventory/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM inventory WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Inventory item deleted" });
  });
});

// ============================================
// 📦 ORDERS + Auto Invoice Generation
// ============================================
app.get("/orders", (req, res) => {
  db.query("SELECT * FROM orders", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post("/orders", (req, res) => {
  const { client_name, product_name, quantity, order_date, status } = req.body;

  db.query("SELECT stock_quantity, price FROM inventory WHERE product_name=?", [product_name], (err, result) => {
    if (err || result.length === 0) return res.status(500).json({ error: "Product not found" });

    const stock = result[0].stock_quantity;
    const price = result[0].price;

    if (stock < quantity) {
      return res.status(400).json({ error: "Not enough stock available" });
    }

    const amount = price * quantity;

    db.query(
      "INSERT INTO orders (client_name, product_name, quantity, order_date, status) VALUES (?, ?, ?, ?, ?)",
      [client_name, product_name, quantity, order_date, status],
      (err, orderResult) => {
        if (err) return res.status(500).json({ error: err.message });

        const orderId = orderResult.insertId;

        db.query(
          "INSERT INTO invoices (order_id, amount, due_date, status) VALUES (?, ?, ?, ?)",
          [orderId, amount, order_date, "Pending"],
          (err, invoiceResult) => {
            if (err) return res.status(500).json({ error: err.message });

            // Update stock quantity
            const newStock = stock - quantity;
            db.query(
              "UPDATE inventory SET stock_quantity=? WHERE product_name=?",
              [newStock, product_name]
            );

            res.json({ message: "Order & Invoice created", order_id: orderId, invoice_id: invoiceResult.insertId, amount });
          }
        );
      }
    );
  });
});

// ============================================
// 🧑 Clients API
// ============================================
app.get("/clients", (req, res) => {
  db.query("SELECT * FROM clients", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post("/clients", (req, res) => {
  const { name, email, contact_number, address } = req.body;
  db.query(
    "INSERT INTO clients (name, email, contact_number, address) VALUES (?, ?, ?, ?)",
    [name, email, contact_number, address],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Client added", id: result.insertId });
    }
  );
});

// ============================================
// 📑 Reports
// ============================================
app.get("/reports/sales", (req, res) => {
  db.query("SELECT SUM(amount) AS total_sales FROM invoices", (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result[0]);
  });
});

app.get("/reports/invoices", (req, res) => {
  db.query("SELECT * FROM invoices ORDER BY id DESC LIMIT 1", (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result[0]); // latest invoice
  });
});

app.get("/invoices", (req, res) => {
  db.query("SELECT * FROM invoices", (err, results) => {
    if (err) {
      console.error("Error fetching invoices:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.put("/inventory/updateStock", (req, res) => {
  const { product_name, quantity } = req.body;
  db.query(
    "UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_name = ?",
    [quantity, product_name],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Inventory stock updated" });
    }
  );
});



// ============================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
