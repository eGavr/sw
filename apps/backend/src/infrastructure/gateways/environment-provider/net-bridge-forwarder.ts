// The loopback port the in-container NetBridge forwarder listens on for the browser's SOCKS5 traffic.
// Fixed (not per-environment) because the browser and the forwarder share the container's network
// namespace, so there is never a conflict — and both sides must agree on it: the compute gateway injects
// it into the forwarder, and the session capabilities point the browser's --proxy-server at it.
export const netBridgeProxyPort = 4400;
