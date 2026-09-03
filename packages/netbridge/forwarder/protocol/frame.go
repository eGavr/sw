// Package protocol is the Go side of the NetBridge mux wire format. It mirrors the frame codec in the
// TypeScript @sw/netbridge package (the source of truth): one WebSocket message carries one frame — a
// 1-byte type, a 4-byte stream id, and a type-specific tail:
//
//	Open  [1][streamId:4][port:2][host…]  — a new TCP stream to host:port (name resolved at the exit)
//	Data  [2][streamId:4][bytes…]         — payload for an open stream
//	Close [3][streamId:4]                 — the stream is finished in the sender's direction
//
// The forwarder only encodes (it opens streams and streams data) and decodes Data/Close from the control
// plane; the channel envelope of @sw/netbridge is the control plane's concern and never reaches here.
package protocol

import (
	"encoding/binary"
	"errors"
)

type FrameType byte

const (
	FrameOpen  FrameType = 1
	FrameData  FrameType = 2
	FrameClose FrameType = 3
)

// MaxDataBytes caps a Data frame's payload so a single WebSocket message never grows unbounded; the
// forwarder chunks a TCP stream into pieces no larger than this. Matches @sw/netbridge.
const MaxDataBytes = 64 * 1024

const (
	headerSize   = 5
	openPortSize = 2
)

var ErrMalformedFrame = errors.New("netbridge: malformed frame")

type Frame struct {
	Type     FrameType
	StreamID uint32
	Host     string // Open only
	Port     uint16 // Open only
	Payload  []byte // Data only
}

func EncodeOpen(streamID uint32, host string, port uint16) []byte {
	buffer := make([]byte, headerSize+openPortSize+len(host))

	writeHeader(buffer, FrameOpen, streamID)
	binary.BigEndian.PutUint16(buffer[headerSize:], port)
	copy(buffer[headerSize+openPortSize:], host)

	return buffer
}

func EncodeData(streamID uint32, payload []byte) []byte {
	buffer := make([]byte, headerSize+len(payload))

	writeHeader(buffer, FrameData, streamID)
	copy(buffer[headerSize:], payload)

	return buffer
}

func EncodeClose(streamID uint32) []byte {
	buffer := make([]byte, headerSize)

	writeHeader(buffer, FrameClose, streamID)

	return buffer
}

func Decode(message []byte) (Frame, error) {
	if len(message) < headerSize {
		return Frame{}, ErrMalformedFrame
	}

	frame := Frame{Type: FrameType(message[0]), StreamID: binary.BigEndian.Uint32(message[1:])}

	switch frame.Type {
	case FrameOpen:
		return decodeOpen(message, frame)
	case FrameData:
		frame.Payload = message[headerSize:]

		return frame, nil
	case FrameClose:
		return frame, nil
	default:
		return Frame{}, ErrMalformedFrame
	}
}

func decodeOpen(message []byte, frame Frame) (Frame, error) {
	if len(message) < headerSize+openPortSize {
		return Frame{}, ErrMalformedFrame
	}

	frame.Port = binary.BigEndian.Uint16(message[headerSize:])
	frame.Host = string(message[headerSize+openPortSize:])

	if frame.Host == "" {
		return Frame{}, ErrMalformedFrame
	}

	return frame, nil
}

func writeHeader(buffer []byte, frameType FrameType, streamID uint32) {
	buffer[0] = byte(frameType)
	binary.BigEndian.PutUint32(buffer[1:], streamID)
}
