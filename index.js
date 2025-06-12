const express = require("express");
const os = require("os");
const { exec } = require("child_process");
const cors = require('cors');
const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());

app.use(express.json());

// Helper to run shell commands
function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) return reject(stderr || error?.message);
      resolve(stdout.trim());
    });
  });
}

app.get("/system-info", async (req, res) => {
  try {
    const osInfo = await runCommand(
      `cat /etc/os-release | grep PRETTY_NAME | cut -d '"' -f 2`
    );
    const kernel = os.release();
    const uptime = await runCommand("uptime -p");
    const cpu = await runCommand("lscpu | grep 'Model name' | cut -d ':' -f 2");
    const mem = await runCommand(`free -h | awk '/Mem/{print $3 "/"$2}'`);
    res.json({
      hostname: os.hostname(),
      os: osInfo,
      kernel,
      uptime,
      cpu: cpu?.trim(),
      memory: mem,
    });
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// Update & Upgrade System
app.post("/update-system", async (req, res) => {
  try {
    await runCommand(
      "sudo apt update && sudo apt upgrade -y && suo apt autoremove -y"
    );
    res?.status(200).send("System Updated successfully!");
  } catch (err) {
    res?.status(500).send(err);
  }
});

// Reboot
app.post("/reboot", async (req, res) => {
  try {
    await runCommand("sudo reboot");
    res.status(200)?.send("System updated successfully");
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// Shutdown
app.post("/shutdown", async (req, res) => {
  try {
    await runCommand("sudo shutdown now");
    res?.status(200)?.send("Shut down Successful!");
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// Manage Service
app.post("/service", async (req, res) => {
  const { action, name } = req?.body;
  if (!["start", "stop", "restart"].includes(action) || !name) {
    return res?.status(400)?.send("Invalid service action or name");
  }
  try {
    await runCommand(`sudo systemctl ${action} ${name}`);
    res?.send(200)?.(`Service: ${name} (${action})`);
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// Network Info
app.get("/network-info", async (req, res) => {
  try {
    const ip = await runCommand("hostname -I");
    const iface = await runCommand(
      `ip route show default | awk '/default/ {print $5}'`
    );
    const mac = await runCommand(`cat /sys/class/net/${iface}/address`);
    const publicIp = await runCommand("curl -s ifconfig.me");
    res?.status(200)?.json({
      ip,
      mac,
      publicIp,
    });
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// Disk Usage
app.get("/disk-usage", async (req, res) => {
  try {
    const usage = await runCommand("df -h");
    res?.type("text/plain")?.send(usage);
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// CPU temperature
app.get("/cpu-temp", async (req, res) => {
  try {
    const temp = await runCommand("vcgencmd measure_temp");
    res?.send(temp);
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// 9. GPIO Control (requires WiringPi or pigpio installed)
app.post("/gpio", async (req, res) => {
  const { pin, action } = req.body;
  if (!pin || !["read", "high", "low"].includes(action)) {
    return res.status(400).send("Invalid GPIO request.");
  }
  try {
    let result;
    if (action === "read") {
      result = await runCommand(`gpio read ${pin}`);
    } else {
      await runCommand(`gpio mode ${pin} out`);
      await runCommand(`gpio write ${pin} ${action === "high" ? 1 : 0}`);
      result = `Pin ${pin} set to ${action.toUpperCase()}`;
    }
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(
    `Raspberry Pi Control Center server running at http://localhost:${PORT}`
  );
});
