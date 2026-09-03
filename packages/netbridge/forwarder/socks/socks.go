// Package socks implements the minimal slice of SOCKS5 (RFC 1928) the forwarder needs: the no-auth
// CONNECT negotiation. It deliberately does NOT dial the target — it returns the requested host:port so
// the caller tunnels the connection to the exit, where the name is resolved on the user's network.
package socks

import (
	"encoding/binary"
	"errors"
	"io"
	"net"
)

const (
	version5   = 0x05
	methodNone = 0x00
	cmdConnect = 0x01

	atypIPv4   = 0x01
	atypDomain = 0x03
	atypIPv6   = 0x04

	replySucceeded = 0x00
)

var (
	ErrUnsupportedVersion = errors.New("socks: unsupported version")
	ErrUnsupportedCommand = errors.New("socks: unsupported command")
	ErrUnsupportedAddress = errors.New("socks: unsupported address type")
)

// Negotiate runs the no-auth CONNECT handshake and returns the requested target. On success it has told
// the client the connection is established, so the caller can treat the stream as raw bytes from here.
func Negotiate(client io.ReadWriter) (host string, port uint16, err error) {
	if err = acceptNoAuth(client); err != nil {
		return "", 0, err
	}

	return readRequest(client)
}

func acceptNoAuth(client io.ReadWriter) error {
	header := make([]byte, 2)
	if _, err := io.ReadFull(client, header); err != nil {
		return err
	}

	if header[0] != version5 {
		return ErrUnsupportedVersion
	}

	methods := make([]byte, header[1])
	if _, err := io.ReadFull(client, methods); err != nil {
		return err
	}

	_, err := client.Write([]byte{version5, methodNone})

	return err
}

func readRequest(client io.ReadWriter) (string, uint16, error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(client, header); err != nil {
		return "", 0, err
	}

	if header[0] != version5 {
		return "", 0, ErrUnsupportedVersion
	}

	if header[1] != cmdConnect {
		return "", 0, ErrUnsupportedCommand
	}

	host, err := readAddress(client, header[3])
	if err != nil {
		return "", 0, err
	}

	port, err := readPort(client)
	if err != nil {
		return "", 0, err
	}

	if err := replyEstablished(client); err != nil {
		return "", 0, err
	}

	return host, port, nil
}

func readAddress(client io.Reader, addressType byte) (string, error) {
	switch addressType {
	case atypIPv4:
		return readIP(client, net.IPv4len)
	case atypIPv6:
		return readIP(client, net.IPv6len)
	case atypDomain:
		return readDomain(client)
	default:
		return "", ErrUnsupportedAddress
	}
}

func readIP(client io.Reader, length int) (string, error) {
	raw := make([]byte, length)
	if _, err := io.ReadFull(client, raw); err != nil {
		return "", err
	}

	return net.IP(raw).String(), nil
}

func readDomain(client io.Reader) (string, error) {
	length := make([]byte, 1)
	if _, err := io.ReadFull(client, length); err != nil {
		return "", err
	}

	name := make([]byte, length[0])
	if _, err := io.ReadFull(client, name); err != nil {
		return "", err
	}

	return string(name), nil
}

func readPort(client io.Reader) (uint16, error) {
	raw := make([]byte, 2)
	if _, err := io.ReadFull(client, raw); err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint16(raw), nil
}

// The bound address in the reply is meaningless for a tunnelled CONNECT, so it is the unspecified
// 0.0.0.0:0 — clients ignore it.
func replyEstablished(client io.Writer) error {
	_, err := client.Write([]byte{version5, replySucceeded, 0x00, atypIPv4, 0, 0, 0, 0, 0, 0})

	return err
}
