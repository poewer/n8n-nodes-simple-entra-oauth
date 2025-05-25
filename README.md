# n8n-nodes-websocket

[![npm version](https://badge.fury.io/js/n8n-nodes-websocket.svg)](https://badge.fury.io/js/n8n-nodes-websocket)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Enhanced WebSocket nodes for n8n that enable **bidirectional real-time communication** between your workflows and external applications.

![n8n WebSocket Nodes](https://raw.githubusercontent.com/poewer/n8n-nodes-websocket/main/docs/banner.png)

## 🚀 Features

### 🔌 WebSocket Trigger Node
- **Real-time WebSocket Server** - Start a WebSocket server directly in n8n
- **External Access** - Listen on `0.0.0.0` for external connections or `localhost` for local only
- **Bidirectional Communication** - Receive messages from clients and send responses back
- **Auto Messages** - Welcome messages, periodic heartbeats, and auto-replies
- **Authentication** - Secure connections with header tokens or query parameters
- **Connection Management** - Automatic cleanup, ping/pong, and connection limits

### 📤 WebSocket Response Node
- **Reply to Sender** - Respond directly to the client who sent a message
- **Broadcast to All** - Send messages to all connected clients simultaneously
- **Send to Specific Connection** - Target individual clients by connection ID
- **Multiple Message Formats** - Plain text, JSON builder, or template with variables
- **Connection Verification** - Check if connections are still active before sending

## 📦 Installation

### Option 1: n8n Community Nodes (Recommended)
1. Open your n8n instance
2. Go to **Settings** → **Community Nodes**
3. Click **Install** and enter: `n8n-nodes-websocket`
4. Click **Install**
5. Restart n8n

### Option 2: Manual Installation
```bash
# Navigate to your n8n installation directory
cd ~/.n8n

# Install the package
npm install n8n-nodes-websocket

# Restart n8n
```

### Option 3: Docker
Add to your `Dockerfile`:
```dockerfile
RUN cd /usr/local/lib/node_modules/n8n && npm install n8n-nodes-websocket
```

## 🏃‍♂️ Quick Start

### 1. Basic Echo Server
Create a simple WebSocket server that echoes back any message:

1. **Add WebSocket Trigger** to your workflow
2. **Configure the trigger:**
   - Port: `8080`
   - Path: `/echo`
   - Trigger On: `Message`
3. **Add WebSocket Response** node
4. **Configure the response:**
   - Operation: `Reply to Sender`
   - Connection ID Source: `From Input Data`
   - Message: `Echo: {{$json.data}}`
5. **Connect** the nodes and **activate** the workflow

**Test it:**
```javascript
const ws = new WebSocket('ws://localhost:8080/echo');
ws.onopen = () => ws.send('Hello World!');
ws.onmessage = (event) => console.log(event.data); // "Echo: Hello World!"
```

### 2. Real-time Chat Broadcast
Create a chat server that broadcasts messages to all connected clients:

1. **WebSocket Trigger** → **Set Node** → **WebSocket Response**
2. **WebSocket Response configuration:**
   - Operation: `Broadcast to All`
   - Message Format: `JSON Object`
   - Message Type: `chat`
   - Message Content: `{{$json.data}}`

## 📖 Usage Examples

### Real-time Dashboard Updates
```
HTTP Request → Process Data → WebSocket Response (Broadcast)
```
Send live updates to dashboard clients when data changes.

### IoT Device Communication
```
WebSocket Trigger → Database → WebSocket Response (Reply to Sender)
```
Receive data from IoT devices and send confirmation responses.

### Multi-user Notifications
```
Schedule Trigger → Get Users → WebSocket Response (Send to Multiple)
```
Send scheduled notifications to specific connected users.

### Live Data Streaming
```
WebSocket Trigger → API Call → Transform Data → WebSocket Response
```
Stream processed data in real-time to connected applications.

## 🔧 Configuration

### WebSocket Trigger Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Port** | Port number for the WebSocket server | `8080` |
| **Path** | URL path for WebSocket connections | `/websocket` |
| **Bind Address** | Network interface (`0.0.0.0` for external, `127.0.0.1` for local) | `0.0.0.0` |
| **Trigger On** | When to trigger workflow (Connection/Message/Both) | `Message` |
| **Response Mode** | How to respond (None/Echo/Custom) | `No Response` |

### Authentication Options
- **None** - No authentication required
- **Header Token** - Require token in connection headers
- **Query Parameter** - Require token as URL parameter

### Auto Messages
- **Welcome Message** - Send when client connects
- **Periodic Messages** - Send at regular intervals to all clients
- **Auto Reply** - Automatic response after receiving messages

### WebSocket Response Settings

| Operation | Description |
|-----------|-------------|
| **Reply to Sender** | Send message back to the original sender |
| **Send to Specific Connection** | Send to a specific connection ID |
| **Broadcast to All** | Send to all connected clients |
| **Get Active Connections** | Retrieve list of active connections |

## 🌐 Client Examples

### JavaScript (Browser)
```javascript
const ws = new WebSocket('ws://your-server:8080/websocket');

ws.onopen = () => {
    console.log('Connected to n8n WebSocket');
    ws.send(JSON.stringify({
        type: 'greeting',
        message: 'Hello from browser!'
    }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);
};

ws.onclose = () => console.log('Disconnected');
ws.onerror = (error) => console.error('Error:', error);
```

### Python
```python
import asyncio
import websockets
import json

async def websocket_client():
    uri = "ws://your-server:8080/websocket"
    
    async with websockets.connect(uri) as websocket:
        # Send message
        await websocket.send(json.dumps({
            "type": "data",
            "payload": {"temperature": 23.5, "humidity": 60}
        }))
        
        # Receive response
        response = await websocket.recv()
        print(f"Server response: {response}")

# Run the client
asyncio.run(websocket_client())
```

### Node.js
```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://your-server:8080/websocket');

ws.on('open', () => {
    console.log('Connected to n8n');
    
    // Send periodic data
    setInterval(() => {
        ws.send(JSON.stringify({
            type: 'sensor_data',
            data: {
                timestamp: new Date().toISOString(),
                value: Math.random() * 100
            }
        }));
    }, 5000);
});

ws.on('message', (data) => {
    console.log('Received:', data.toString());
});
```

### cURL (Testing)
```bash
# Install websocat for command-line WebSocket testing
# https://github.com/vi/websocat

# Connect and send message
echo '{"type": "test", "message": "Hello from command line"}' | websocat ws://localhost:8080/websocket
```

## 🎨 Message Templates

Use these variables in your messages:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{timestamp}}` | Current ISO timestamp | `2025-05-23T21:30:00.000Z` |
| `{{date}}` | Current date | `5/23/2025` |
| `{{time}}` | Current time | `9:30:00 PM` |
| `{{connectionCount}}` | Number of active connections | `5` |
| `{{connectionId}}` | Current connection ID | `abc123` |

**Example template:**
```json
{
  "type": "notification",
  "message": "Hello user!",
  "timestamp": "{{timestamp}}",
  "activeUsers": {{connectionCount}},
  "yourConnectionId": "{{connectionId}}"
}
```

## 🔒 Security & Authentication

### Header Token Authentication
```javascript
const ws = new WebSocket('ws://localhost:8080/websocket', {
    headers: {
        'Authorization': 'Bearer your-secret-token'
    }
});
```

### Query Parameter Authentication
```javascript
const ws = new WebSocket('ws://localhost:8080/websocket?token=your-secret-token');
```

### Connection Limits
Set maximum concurrent connections to prevent abuse:
```json
{
  "maxConnections": 100,
  "pingInterval": 30000,
  "messageSizeLimit": 1024
}
```

## 🚨 Troubleshooting

### Common Issues

**❌ "Connection refused"**
- Check if the port is correct and not in use
- Verify n8n workflow is active
- Check firewall settings

**❌ "Can't connect from external network"**
- Set Bind Address to `0.0.0.0` (not `127.0.0.1`)
- Open port in firewall/router
- Check network configuration

**❌ "Authentication failed"**
- Verify token format and parameter name
- Check token value matches exactly
- Ensure authentication method is configured correctly

**❌ "Message not sending"**
- Check if connection is still active
- Verify connection ID is correct
- Enable "Verify Connection Before Send"

### Debug Mode
Enable debug logging in n8n:
```bash
export N8N_LOG_LEVEL=debug
n8n start
```

### Performance Tips
- Use connection limits to prevent resource exhaustion
- Enable periodic cleanup for dead connections
- Implement rate limiting in your workflows
- Use message size limits to prevent large payloads

## 📊 Workflow Output

### WebSocket Trigger Output
```json
{
  "event": "message",
  "data": "client message content",
  "connectionInfo": {
    "connectionId": "abc123",
    "remoteAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2025-05-23T21:30:00.000Z"
  },
  "meta": {
    "totalConnections": 5,
    "messageSize": 1024,
    "timestamp": "2025-05-23T21:30:00.000Z"
  }
}
```

### WebSocket Response Output
```json
{
  "operation": "replyToSender",
  "connectionId": "abc123",
  "message": "Hello World!",
  "success": true,
  "totalConnections": 5,
  "timestamp": "2025-05-23T21:30:00.000Z"
}
```

## 🛠️ Development

### Building from Source
```bash
git clone https://github.com/poewer/n8n-nodes-websocket.git
cd n8n-nodes-websocket
npm install
npm run build
```

### Local Testing
```bash
# Build and link locally
npm run build
npm link

# In your n8n project
npm link n8n-nodes-websocket
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 **Documentation**: [GitHub Wiki](https://github.com/poewer/n8n-nodes-websocket/wiki)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/poewer/n8n-nodes-websocket/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/poewer/n8n-nodes-websocket/discussions)
- 📧 **Email**: Support available through GitHub issues

## 🎯 Roadmap

- [ ] WebSocket client node (connect to external WebSocket servers)
- [ ] SSL/TLS support (wss://)
- [ ] Message queuing and persistence
- [ ] Room/channel support for grouped messaging
- [ ] Advanced authentication methods
- [ ] Metrics and monitoring dashboard

---

**Made with ❤️ for the [n8n](https://n8n.io) community**

*⭐ If this package helped you, please give it a star on [GitHub](https://github.com/poewer/n8n-nodes-websocket)!*