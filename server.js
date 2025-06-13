const express = require('express');
const { exec } = require('child_process');
const app = express();
const PORT = 3002;

app.use(express.json());

// Command to ping a slave
app.post('/ping', (req, res) => {
    const { ip } = req.body;
    exec(`ping -c 1 ${ip}`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).send(`Ping failed: ${stderr}`);
        }
        res.send(`Ping successful:\n${stdout}`);
    });
});

// Command to SSH and run a command on a slave
app.post('/command', (req, res) => {
    const { ip, cmd } = req.body;
    exec(`ssh pi@${ip} "${cmd}"`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).send(`Command failed: ${stderr}`);
        }
        res.send(`Command output:\n${stdout}`);
    });
});

app.listen(PORT, () => {
    console.log(`Master Controller API running on port ${PORT}`);
});
