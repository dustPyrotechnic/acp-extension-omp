const frame =
  process.argv[2] ??
  '{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}';
process.stdout.write(`${frame}\n`);
