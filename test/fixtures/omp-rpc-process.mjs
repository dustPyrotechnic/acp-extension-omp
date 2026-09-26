const frame = process.argv[2] ?? '{"type":"ready","protocolVersion":1}';
process.stdout.write(`${frame}\n`);
