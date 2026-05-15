import useIMU from "./useIMU";

export default function usePressure(wsUrl) {
  const { pressure, connected, status, error, lastUpdated } = useIMU(wsUrl);

  return {
    ...pressure,
    connected,
    status,
    error,
    lastUpdated,
  };
}
