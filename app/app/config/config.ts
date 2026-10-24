
const turnUrls = (process.env.NEXT_PUBLIC_TURN_URL ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.relay.metered.ca:80" },
];

if (turnUrls.length > 0 && turnUsername && turnCredential) {
  iceServers.push({
    urls: turnUrls,
    username: turnUsername,
    credential: turnCredential,
  });
}

const configuration: RTCConfiguration = {
  iceServers,
  iceTransportPolicy: "all",
};

export default configuration;
