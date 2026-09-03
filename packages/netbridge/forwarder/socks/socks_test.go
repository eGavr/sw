package socks

import (
	"bytes"
	"io"
	"testing"
)

type pipe struct {
	io.Reader
	io.Writer
}

func TestNegotiateDomain(t *testing.T) {
	request := []byte{
		version5, 0x01, methodNone, // greeting: one method, no-auth
		version5, cmdConnect, 0x00, atypDomain, // request: CONNECT, domain
		0x09, 'l', 'o', 'c', 'a', 'l', 'h', 'o', 's', 't', // "localhost"
		0x0b, 0xb8, // port 3000
	}
	out := &bytes.Buffer{}

	host, port, err := Negotiate(pipe{bytes.NewReader(request), out})
	if err != nil {
		t.Fatalf("negotiate: %v", err)
	}

	if host != "localhost" || port != 3000 {
		t.Fatalf("unexpected target: %s:%d", host, port)
	}

	// no-auth reply, then the established reply
	expected := []byte{version5, methodNone, version5, replySucceeded, 0x00, atypIPv4, 0, 0, 0, 0, 0, 0}
	if !bytes.Equal(out.Bytes(), expected) {
		t.Fatalf("unexpected replies: %v", out.Bytes())
	}
}

func TestNegotiateIPv4(t *testing.T) {
	request := []byte{
		version5, 0x01, methodNone,
		version5, cmdConnect, 0x00, atypIPv4,
		127, 0, 0, 1,
		0x1f, 0x90, // port 8080
	}

	host, port, err := Negotiate(pipe{bytes.NewReader(request), &bytes.Buffer{}})
	if err != nil {
		t.Fatalf("negotiate: %v", err)
	}

	if host != "127.0.0.1" || port != 8080 {
		t.Fatalf("unexpected target: %s:%d", host, port)
	}
}

func TestNegotiateRejectsNonConnect(t *testing.T) {
	request := []byte{
		version5, 0x01, methodNone,
		version5, 0x02, 0x00, atypIPv4, // 0x02 = BIND, unsupported
		127, 0, 0, 1, 0x00, 0x50,
	}

	if _, _, err := Negotiate(pipe{bytes.NewReader(request), &bytes.Buffer{}}); err != ErrUnsupportedCommand {
		t.Fatalf("expected ErrUnsupportedCommand, got %v", err)
	}
}

func TestNegotiateRejectsWrongVersion(t *testing.T) {
	request := []byte{0x04, 0x01, methodNone}

	if _, _, err := Negotiate(pipe{bytes.NewReader(request), &bytes.Buffer{}}); err != ErrUnsupportedVersion {
		t.Fatalf("expected ErrUnsupportedVersion, got %v", err)
	}
}
