// Decides which destination hosts the app may send network DMX to. The control surface has no login, so a client must
// not be able to point the output at an arbitrary machine: only IPv4 addresses on the local network, loopback, link-local,
// multicast or the broadcast address are accepted. Hostnames are rejected (enter the device's IP address instead).
const OCTET = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
const IPV4 = new RegExp(`^(${OCTET})\\.(${OCTET})\\.(${OCTET})\\.(${OCTET})$`);

export const HOST_HELP = "Use your device's IP address on your own network, for example 192.168.1.50";

export function isAllowedHost(host) {
  if (host === '') {
    return true;
  }
  const match = IPV4.exec(host);
  if (!match) {
    return false;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first >= 224 && first <= 239) ||
    host === '255.255.255.255'
  );
}
