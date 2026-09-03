package protocol

import (
	"bytes"
	"testing"
)

func TestOpenRoundTrip(t *testing.T) {
	frame, err := Decode(EncodeOpen(7, "localhost", 3000))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if frame.Type != FrameOpen || frame.StreamID != 7 || frame.Host != "localhost" || frame.Port != 3000 {
		t.Fatalf("unexpected open frame: %+v", frame)
	}
}

func TestOpenRoundTripIPv6Host(t *testing.T) {
	frame, err := Decode(EncodeOpen(1, "::1", 8080))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if frame.Host != "::1" || frame.Port != 8080 {
		t.Fatalf("unexpected open frame: %+v", frame)
	}
}

func TestDataRoundTrip(t *testing.T) {
	payload := []byte{0x00, 0x01, 0xff, 0x7f}

	frame, err := Decode(EncodeData(42, payload))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if frame.Type != FrameData || frame.StreamID != 42 || !bytes.Equal(frame.Payload, payload) {
		t.Fatalf("unexpected data frame: %+v", frame)
	}
}

func TestCloseRoundTrip(t *testing.T) {
	frame, err := Decode(EncodeClose(0xffffffff))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if frame.Type != FrameClose || frame.StreamID != 0xffffffff {
		t.Fatalf("unexpected close frame: %+v", frame)
	}
}

func TestDecodeRejectsShortMessage(t *testing.T) {
	if _, err := Decode([]byte{byte(FrameData), 0x00}); err != ErrMalformedFrame {
		t.Fatalf("expected ErrMalformedFrame, got %v", err)
	}
}

func TestDecodeRejectsUnknownType(t *testing.T) {
	message := make([]byte, headerSize)
	message[0] = 99

	if _, err := Decode(message); err != ErrMalformedFrame {
		t.Fatalf("expected ErrMalformedFrame, got %v", err)
	}
}

func TestDecodeRejectsOpenWithoutHost(t *testing.T) {
	message := make([]byte, headerSize+openPortSize)
	message[0] = byte(FrameOpen)

	if _, err := Decode(message); err != ErrMalformedFrame {
		t.Fatalf("expected ErrMalformedFrame, got %v", err)
	}
}
