const express = require("express");
const os = require("os");
const { exec } = require("child_process");
const cors = require("cors");
const app = express();
const PORT = 3001;

app.use(
  cors({
    origin: ["http://localhost:3000"], // allow specific origins
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

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
    res.json([
      {
        name: "Hostname",
        description: os.hostname(),
      },
      {
        name: "OS",
        description: osInfo,
      },
      {
        name: "Kernel",
        description: kernel,
      },
      {
        name: "Uptime",
        description: uptime,
      },
      {
        name: "CPU",
        description: cpu?.trim(),
      },
      {
        name: "Memory",
        description: mem,
      },
    ]);
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// Update & Upgrade System
app.post("/update-system", async (req, res) => {
  try {
    await runCommand(
      "sudo apt-get update && sudo apt-get upgrade -y && sudo apt-get autoremove -y"
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
    res.status(200)?.json({ message: "Rebooted Successfully!" });
  } catch (err) {
    res?.status(500)?.json({ message: err });
  }
});

// Shutdown
app.post("/shutdown", async (req, res) => {
  try {
    await runCommand("sudo shutdown now");
    res?.status(200)?.json({ message: "Shut Down Successfully!" });
  } catch (err) {
    res?.status(500)?.json({ message: err });
  }
});

// Manage Service
app.post("/service", async (req, res) => {
  const { action, name } = req.body;

  if (!["start", "stop", "restart"].includes(action) || !name) {
    return res.status(400).json({ message: "Invalid service action or name" });
  }

  try {
    await runCommand(`sudo systemctl ${action} ${name}`);
    res
      .status(200)
      .json({ message: `Service: ${name} (${action}) successful` });
  } catch (err) {
    res.status(500).json({
      message: "Failed to manage service",
      error: err.message || String(err),
    });
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
    res?.status(200)?.json([
      {
        name: "IP",
        description: ip,
      },
      {
        name: "MAC",
        description: mac,
      },
      {
        name: "Public IP",
        description: publicIp,
      },
    ]);
  } catch (err) {
    res?.status(500)?.send(err);
  }
});

// Disk Usage
app.get("/disk-usage", async (req, res) => {
  try {
    const usage = await runCommand("df -h");
    // Parse the text output to structured JSON
    const lines = usage.trim().split("\n");
    const headers = lines[0].split(/\s+/);
    const data = lines.slice(1).map((line) => {
      const parts = line.split(/\s+/);
      const entry = {};
      headers.forEach((header, i) => {
        entry[header] = parts[i];
      });
      return entry;
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// CPU temperature
app.get("/cpu-temp", async (req, res) => {
  try {
    const tempOutput = await runCommand("vcgencmd measure_temp"); // e.g., "temp=49.0'C\n"

    // Extract the numeric temperature value
    const match = tempOutput.match(/temp=([\d.]+)'C/);
    const temperature = match ? parseFloat(match[1]) : null;

    res.json({
      temperatureC: temperature,
      rawOutput: tempOutput.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
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
    res.status(500).json({ message: err });
  }
});

// Command to ping a slave
app.post("/ping", async (req, res) => {
  const { ip } = req.body;
  // exec(`ping -c 1 ${ip}`, (error, stdout, stderr) => {
  //   if (error) {
  //     return res.status(500).send(`Ping failed: ${stderr}`);
  //   }
  //   res.send(`Ping successful:\n${stdout}`);
  // });
  res?.send(ip);
  try {
    await runCommand(`ping -c 1 ${ip}`);
    res?.status(200)?.json({ message: "Successfully Ping!" });
  } catch (err) {
    res?.status(500)?.json({ message: err });
  }
});

// Command to SSH and run a command on a slave
app.post("/command", (req, res) => {
  const { ip, cmd } = req.body;
  exec(`ssh pi@${ip} "${cmd}"`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).send(`Command failed: ${stderr}`);
    }
    res.send(`Command output:\n${stdout}`);
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(
    `Raspberry Pi Control Center server running at http://localhost:${PORT}`
  );
});
