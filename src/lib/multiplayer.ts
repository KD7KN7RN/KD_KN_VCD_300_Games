import Peer, { DataConnection, MediaConnection } from 'peerjs';

export interface MultiplayerMessage {
  type: 'input' | 'ping' | 'pong' | 'game_info' | 'sync_state';
  player?: 1 | 2;
  button?: 'A' | 'B' | 'START' | 'SELECT' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  action?: 'down' | 'up';
  gameName?: string;
  gameId?: number;
  timestamp?: number;
}

export interface MultiplayerSession {
  peerId: string;
  roomCode: string;
  isHost: boolean;
  connected: boolean;
  latencyMs: number;
}

export type InputCallback = (button: string, action: 'down' | 'up', player: 1 | 2) => void;
export type StreamCallback = (stream: MediaStream) => void;
export type StatusCallback = (connected: boolean, latencyMs: number) => void;

// Generate simple 4-character room code (e.g. 7492 or AB34)
export function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function formatPeerId(roomCode: string): string {
  return `vcd300-nes-${roomCode.toUpperCase().trim()}`;
}

export class MultiplayerHost {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private mediaConnection: MediaConnection | null = null;
  public roomCode: string;
  public peerId: string;
  private onInputCb: InputCallback | null = null;
  private onStatusCb: StatusCallback | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private streamToShare: MediaStream | null = null;

  constructor(roomCode: string, stream?: MediaStream | null) {
    this.roomCode = roomCode.toUpperCase().trim();
    this.peerId = formatPeerId(this.roomCode);
    this.streamToShare = stream || null;
  }

  public init(
    onReady: (roomCode: string) => void,
    onStatus: StatusCallback,
    onInput: InputCallback,
    onError: (err: string) => void
  ) {
    this.onStatusCb = onStatus;
    this.onInputCb = onInput;

    try {
      this.peer = new Peer(this.peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      this.peer.on('open', (id) => {
        console.log('Multiplayer Host Peer opened:', id);
        onReady(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        this.setupDataConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Host peer error:', err);
        // If peer ID is taken, retry with a slightly modified code
        if (err.type === 'unavailable-id') {
          this.destroy();
          const newCode = generateRoomCode();
          this.roomCode = newCode;
          this.peerId = formatPeerId(newCode);
          this.init(onReady, onStatus, onInput, onError);
          return;
        }
        onError(err.message || 'فشل إنشاء غرفة اللعب الجماعي');
      });
    } catch (e) {
      console.error('MultiplayerHost init failed:', e);
      onError('تعذر تشغيل اتصال اللعب الثنائي عبر الواي فاي');
    }
  }

  public updateStream(stream: MediaStream) {
    this.streamToShare = stream;
    if (this.connection && this.peer && this.connection.open) {
      try {
        if (this.mediaConnection) {
          this.mediaConnection.close();
        }
        this.mediaConnection = this.peer.call(this.connection.peer, stream);
      } catch (err) {
        console.warn('Failed to call client with new stream:', err);
      }
    }
  }

  private setupDataConnection(conn: DataConnection) {
    this.connection = conn;

    conn.on('open', () => {
      console.log('Player 2 connected to Host!');
      this.onStatusCb?.(true, 0);

      // If we have a screen stream, call Player 2 to send live video
      if (this.streamToShare && this.peer) {
        try {
          this.mediaConnection = this.peer.call(conn.peer, this.streamToShare);
        } catch (e) {
          console.warn('Error starting media call to Player 2:', e);
        }
      }

      // Ping to measure Wi-Fi / Hotspot latency
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.connection && this.connection.open) {
          this.connection.send({ type: 'ping', timestamp: performance.now() });
        }
      }, 2000);
    });

    conn.on('data', (data) => {
      const msg = data as MultiplayerMessage;
      if (msg.type === 'input' && msg.button && msg.action) {
        this.onInputCb?.(msg.button, msg.action, 2);
      } else if (msg.type === 'pong' && msg.timestamp) {
        const rtt = Math.round(performance.now() - msg.timestamp);
        this.onStatusCb?.(true, Math.max(1, Math.round(rtt / 2)));
      }
    });

    conn.on('close', () => {
      this.onStatusCb?.(false, 0);
      if (this.pingInterval) clearInterval(this.pingInterval);
    });

    conn.on('error', (err) => {
      console.error('Host connection error:', err);
      this.onStatusCb?.(false, 0);
    });
  }

  public destroy() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.mediaConnection) this.mediaConnection.close();
    if (this.connection) this.connection.close();
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.connection = null;
    this.mediaConnection = null;
  }
}

export class MultiplayerClient {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private mediaConnection: MediaConnection | null = null;
  public roomCode: string;
  private onStatusCb: StatusCallback | null = null;
  private onStreamCb: StreamCallback | null = null;

  constructor(roomCode: string) {
    this.roomCode = roomCode.toUpperCase().trim();
  }

  public connect(
    onConnected: () => void,
    onStatus: StatusCallback,
    onStream: StreamCallback,
    onError: (err: string) => void
  ) {
    this.onStatusCb = onStatus;
    this.onStreamCb = onStream;

    try {
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      this.peer.on('open', () => {
        const hostPeerId = formatPeerId(this.roomCode);
        console.log('Client connecting to Host peer:', hostPeerId);
        const conn = this.peer!.connect(hostPeerId, { reliable: false });

        conn.on('open', () => {
          this.connection = conn;
          onConnected();
          this.onStatusCb?.(true, 0);
        });

        conn.on('data', (data) => {
          const msg = data as MultiplayerMessage;
          if (msg.type === 'ping' && msg.timestamp) {
            conn.send({ type: 'pong', timestamp: msg.timestamp });
          }
        });

        conn.on('close', () => {
          this.onStatusCb?.(false, 0);
        });

        conn.on('error', (err) => {
          console.error('Client data connection error:', err);
          onError('انقطع الاتصال مع اللاعب 1 أو تعذر الوصول إليه على الشبكة');
        });
      });

      // Handle receiving incoming video stream from Host
      this.peer.on('call', (call) => {
        this.mediaConnection = call;
        call.answer(); // Answer without sending local stream
        call.on('stream', (remoteStream) => {
          console.log('Received remote video stream from Host!');
          this.onStreamCb?.(remoteStream);
        });
      });

      this.peer.on('error', (err) => {
        console.error('Client peer error:', err);
        if (err.type === 'peer-unavailable') {
          onError(`لم يتم العثور على غرفة بهذا الرمز (${this.roomCode}). تأكد من كتابة الرمز بشكل صحيح ومن أن الجهازين على نفس شبكة الواي فاي أو نقطة الاتصال.`);
        } else {
          onError(err.message || 'تعذر الاتصال باللاعب 1');
        }
      });
    } catch (e) {
      console.error('Client connect failed:', e);
      onError('فشل بدء اتصال اللعب الثنائي');
    }
  }

  public sendInput(button: 'A' | 'B' | 'START' | 'SELECT' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', action: 'down' | 'up') {
    if (this.connection && this.connection.open) {
      this.connection.send({
        type: 'input',
        player: 2,
        button,
        action,
      });
    }
  }

  public destroy() {
    if (this.mediaConnection) this.mediaConnection.close();
    if (this.connection) this.connection.close();
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.connection = null;
    this.mediaConnection = null;
  }
}
