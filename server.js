const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const sqlite3 = require('sqlite3').verbose();

const HTTP_PORT = Number(process.env.PORT || 3000);
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM4';
const BAUD_RATE = Number(process.env.BAUD_RATE || 9600);

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./smartjacket.db', (err) => {
  if (err) {
    console.error('Unable to open SQLite database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sensor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature REAL,
    status TEXT,
    ambientTemp REAL,
    jacketTemp REAL,
    battery REAL,
    powerUsage REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

let latestSensorData = {
  temperature: null,
  status: 'Unknown',
  ambientTemp: null,
  jacketTemp: null,
  battery: null,
  powerUsage: null,
  connected: false,
  error: null,
  timestamp: null
};

const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE, autoOpen: false });
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

port.open((error) => {
  if (error) {
    latestSensorData.error = `Serial port open failed: ${error.message}`;
    console.error(latestSensorData.error);
    return;
  }
  latestSensorData.connected = true;
  latestSensorData.error = null;
  console.log(`Bluetooth serial port opened on ${SERIAL_PORT} at ${BAUD_RATE} baud.`);
});

port.on('error', (error) => {
  latestSensorData.connected = false;
  latestSensorData.error = `Serial port error: ${error.message}`;
  console.error(latestSensorData.error);
});

port.on('close', () => {
  latestSensorData.connected = false;
  latestSensorData.error = 'Serial port closed';
  console.warn('Serial port closed.');
});

parser.on('data', (line) => {
  try {
    const payload = JSON.parse(line);
    latestSensorData = {
      ...latestSensorData,
      ...payload,
      connected: true,
      error: null,
      timestamp: new Date().toISOString()
    };

    const insert = `INSERT INTO sensor_logs (temperature, status, ambientTemp, jacketTemp, battery, powerUsage) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(insert, [
      latestSensorData.temperature,
      latestSensorData.status,
      latestSensorData.ambientTemp,
      latestSensorData.jacketTemp,
      latestSensorData.battery,
      latestSensorData.powerUsage
    ], function (err) {
      if (err) {
        console.error('SQLite insert error:', err.message);
      }
    });

    console.log('Received SmartJacket data:', latestSensorData);
  } catch (error) {
    console.warn('Unable to parse serial line as JSON:', line);
  }
});

app.get('/api/data', (req, res) => {
  res.json(latestSensorData);
});

app.get('/api/data/live', (req, res) => {
  res.json(latestSensorData);
});

app.get('/api/data/history', (req, res) => {
  const limit = Number(req.query.limit || 50);
  db.all(`SELECT temperature, status, ambientTemp, jacketTemp, battery, powerUsage, timestamp FROM sensor_logs ORDER BY timestamp DESC LIMIT ?`, [limit], (err, rows) => {
    if (err) {
      console.error('SQLite query error:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.reverse());
  });
});

app.listen(HTTP_PORT, () => {
  console.log(`SmartJacket backend running at http://localhost:${HTTP_PORT}`);
  console.log(`Reading Bluetooth data from ${SERIAL_PORT}`);
});
