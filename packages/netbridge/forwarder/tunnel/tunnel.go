// Package tunnel multiplexes many local TCP connections (the browser's SOCKS streams) over a single
// outbound WebSocket to the control-plane rendezvous. It dials lazily on the first stream and redials
// after a drop; each stream is a protocol frame space keyed by a stream id.
package tunnel

import (
	"context"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/eGavr/sw/packages/netbridge/forwarder/protocol"
)

const (
	// A frame is a full WebSocket message; the read limit must clear the largest Data frame plus header.
	readLimitBytes = protocol.MaxDataBytes + 1024
	dialTimeout    = 10 * time.Second
)

type Hub struct {
	url   string
	token string

	mu      sync.Mutex
	conn    *websocket.Conn
	streams map[uint32]net.Conn
	nextID  uint32

	writeMu sync.Mutex
}

func New(url, token string) *Hub {
	return &Hub{url: url, token: token, streams: make(map[uint32]net.Conn)}
}

// Serve tunnels one negotiated SOCKS connection to host:port and blocks until the stream ends (either
// side closing, or the WebSocket dropping).
func (h *Hub) Serve(ctx context.Context, local net.Conn, host string, port uint16) error {
	conn, err := h.ensureConn(ctx)
	if err != nil {
		return err
	}

	id := h.register(local)
	defer h.closeStream(id)

	if err := h.send(ctx, conn, protocol.EncodeOpen(id, host, port)); err != nil {
		return err
	}

	return h.pump(ctx, conn, id, local)
}

// pump copies the local connection into Data frames until it ends, then signals Close upstream.
func (h *Hub) pump(ctx context.Context, conn *websocket.Conn, id uint32, local net.Conn) error {
	buffer := make([]byte, protocol.MaxDataBytes)

	for {
		read, readErr := local.Read(buffer)

		if read > 0 {
			if err := h.send(ctx, conn, protocol.EncodeData(id, buffer[:read])); err != nil {
				return err
			}
		}

		if readErr != nil {
			break
		}
	}

	return h.send(ctx, conn, protocol.EncodeClose(id))
}

func (h *Hub) ensureConn(ctx context.Context) (*websocket.Conn, error) {
	h.mu.Lock()
	existing := h.conn
	h.mu.Unlock()

	if existing != nil {
		return existing, nil
	}

	dialCtx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()

	conn, _, err := websocket.Dial(dialCtx, h.url, &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": {"Bearer " + h.token}},
	})
	if err != nil {
		return nil, err
	}

	conn.SetReadLimit(readLimitBytes)

	h.mu.Lock()
	if h.conn != nil {
		winner := h.conn
		h.mu.Unlock()
		conn.Close(websocket.StatusNormalClosure, "duplicate")

		return winner, nil
	}
	h.conn = conn
	h.mu.Unlock()

	go h.readLoop(conn)

	return conn, nil
}

// readLoop delivers Data/Close from the control plane to the addressed local connection until the
// WebSocket drops, then tears every stream down so their SOCKS clients see the failure.
func (h *Hub) readLoop(conn *websocket.Conn) {
	defer h.dropConn(conn)

	for {
		_, message, err := conn.Read(context.Background())
		if err != nil {
			return
		}

		frame, err := protocol.Decode(message)
		if err != nil {
			continue
		}

		h.dispatch(frame)
	}
}

func (h *Hub) dispatch(frame protocol.Frame) {
	switch frame.Type {
	case protocol.FrameData:
		if local := h.stream(frame.StreamID); local != nil {
			_, _ = local.Write(frame.Payload)
		}
	case protocol.FrameClose:
		h.closeStream(frame.StreamID)
	}
}

func (h *Hub) send(ctx context.Context, conn *websocket.Conn, data []byte) error {
	h.writeMu.Lock()
	defer h.writeMu.Unlock()

	return conn.Write(ctx, websocket.MessageBinary, data)
}

func (h *Hub) register(local net.Conn) uint32 {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.nextID++
	h.streams[h.nextID] = local

	return h.nextID
}

func (h *Hub) stream(id uint32) net.Conn {
	h.mu.Lock()
	defer h.mu.Unlock()

	return h.streams[id]
}

func (h *Hub) closeStream(id uint32) {
	h.mu.Lock()
	local := h.streams[id]
	delete(h.streams, id)
	h.mu.Unlock()

	if local != nil {
		_ = local.Close()
	}
}

func (h *Hub) dropConn(conn *websocket.Conn) {
	h.mu.Lock()
	if h.conn == conn {
		h.conn = nil
	}

	locals := make([]net.Conn, 0, len(h.streams))
	for id, local := range h.streams {
		locals = append(locals, local)
		delete(h.streams, id)
	}
	h.mu.Unlock()

	_ = conn.Close(websocket.StatusNormalClosure, "")

	for _, local := range locals {
		_ = local.Close()
	}
}
