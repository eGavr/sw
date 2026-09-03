// Command netbridge-forwarder runs inside a browser/appium environment. It exposes a loopback SOCKS5
// proxy the browser is pointed at, and tunnels every connection over one outbound WebSocket to the
// control-plane rendezvous — so the remote browser reaches whatever the tunnel client (on the user's
// machine) can reach. Only outbound: no inbound port is opened in the environment.
package main

import (
	"context"
	"log"
	"net"
	"os"

	"github.com/eGavr/sw/packages/netbridge/forwarder/socks"
	"github.com/eGavr/sw/packages/netbridge/forwarder/tunnel"
)

const defaultProxyPort = "4400"

func main() {
	netBridgeURL := os.Getenv("SW_NETBRIDGE_URL")
	token := os.Getenv("SW_INTERNAL_TOKEN")
	proxyPort := envOr("SW_NETBRIDGE_PROXY_PORT", defaultProxyPort)

	if netBridgeURL == "" || token == "" {
		log.Fatal("netbridge-forwarder: SW_NETBRIDGE_URL and SW_INTERNAL_TOKEN are required")
	}

	hub := tunnel.New(netBridgeURL+"/netbridge/agent", token)

	// Loopback only: the browser shares the environment's network namespace, so it is the sole client;
	// nothing outside the environment can reach the proxy.
	address := net.JoinHostPort("127.0.0.1", proxyPort)

	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("netbridge-forwarder: listen %s: %v", address, err)
	}

	log.Printf("netbridge-forwarder: SOCKS5 on %s -> %s", address, netBridgeURL)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("netbridge-forwarder: accept: %v", err)

			continue
		}

		go handle(hub, conn)
	}
}

func handle(hub *tunnel.Hub, conn net.Conn) {
	host, port, err := socks.Negotiate(conn)
	if err != nil {
		_ = conn.Close()

		return
	}

	if err := hub.Serve(context.Background(), conn, host, port); err != nil {
		log.Printf("netbridge-forwarder: stream %s:%d: %v", host, port, err)
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
