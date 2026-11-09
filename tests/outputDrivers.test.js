// Tests for the Open DMX, Art-Net and sACN drivers: byte-level packets, serial sequencing, and UDP loopback.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { describe, it } from 'node:test';

import { ArtNetDriver, buildArtNetPacket } from '../server/clients/artNetDriver.js';
import { OpenDmxDriver } from '../server/clients/openDmxDriver.js';
import { SacnDriver, buildSacnPacket, multicastAddress } from '../server/clients/sacnDriver.js';

const frameWith = (first) => {
  const frame = new Uint8Array(512);
  frame[0] = first;
  return frame;
};

function createMockPort() {
  const calls = [];
  const port = {
    isOpen: true,
    calls,
    on() {},
    set(options, done) {
      calls.push(['set', options.brk]);
      done();
    },
    write(data, done) {
      calls.push(['write', data.length, data[0], data[1]]);
      done();
    },
    drain(done) {
      calls.push(['drain']);
      done();
    },
    close(done) {
      port.isOpen = false;
      done();
    },
  };
  return port;
}

describe('OpenDmxDriver', () => {
  it('opens at 250000 baud 8N2 and sends break, then start code plus 512 slots, every frame', async () => {
    const port = createMockPort();
    let options;
    const driver = new OpenDmxDriver({
      path: '/dev/test',
      createPort: async (opts) => {
        options = opts;
        return port;
      },
    });
    await driver.open();
    driver.send(frameWith(200));
    await new Promise((resolve) => setTimeout(resolve, 80));
    await driver.close();
    assert.equal(options.baudRate, 250000, 'DMX512 runs at 250 kbaud');
    assert.equal(options.stopBits, 2, 'DMX512 uses two stop bits');
    const kinds = port.calls.map((call) => call.join(':'));
    assert.deepEqual(kinds.slice(0, 2), ['set:true', 'set:false'], 'a break comes before the data');
    const write = port.calls.find((call) => call[0] === 'write');
    assert.equal(write[1], 513, 'start code plus 512 slots');
    assert.equal(write[2], 0, 'the start code is zero');
    assert.ok(
      port.calls.some((call) => call[0] === 'write' && call[3] === 200),
      'slot 1 carries the frame value',
    );
    assert.ok(kinds.includes('drain'), 'frames are drained before the next break');
  });

  it('reports an error status when the port fails', async () => {
    const port = createMockPort();
    port.set = (_options, done) => done(new Error('device unplugged'));
    const driver = new OpenDmxDriver({ path: '/dev/test', createPort: async () => port });
    await driver.open();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(driver.getStatus().error, 'device unplugged', 'the failure is surfaced');
    assert.equal(driver.getStatus().connected, false, 'a failed driver is not connected');
    await driver.close();
  });
});

describe('Art-Net', () => {
  it('builds an ArtDmx packet with the right header, universe and length', () => {
    const packet = buildArtNetPacket(frameWith(255), 0x0102, 7);
    assert.equal(packet.toString('latin1', 0, 8), 'Art-Net\0', 'packet id');
    assert.equal(packet.readUInt16LE(8), 0x5000, 'OpDmx opcode, little endian');
    assert.equal(packet.readUInt16BE(10), 14, 'protocol version 14');
    assert.equal(packet[12], 7, 'sequence');
    assert.equal(packet.readUInt16LE(14), 0x0102, 'port-address, little endian');
    assert.equal(packet.readUInt16BE(16), 512, 'length, big endian');
    assert.equal(packet.length, 18 + 512, 'header plus data');
    assert.equal(packet[18], 255, 'first slot');
  });

  it('delivers frames over UDP to a unicast host', async () => {
    const receiver = dgram.createSocket('udp4');
    await new Promise((resolve) => receiver.bind(0, '127.0.0.1', resolve));
    const received = new Promise((resolve) => receiver.once('message', resolve));
    const driver = new ArtNetDriver({ host: '127.0.0.1', universe: 3, port: receiver.address().port });
    await driver.open();
    driver.send(frameWith(9));
    const packet = await received;
    assert.equal(packet.readUInt16LE(14), 3, 'universe reached the receiver');
    assert.equal(packet[18], 9, 'data reached the receiver');
    await driver.close();
    receiver.close();
  });
});

describe('sACN', () => {
  const cid = Buffer.alloc(16, 0xab);

  it('builds an E1.31 packet with correct layer lengths, vectors and universe', () => {
    const packet = buildSacnPacket(frameWith(77), 5, 3, cid);
    assert.equal(packet.length, 638, '126 header bytes plus 512 slots');
    assert.equal(packet.toString('latin1', 4, 13), 'ASC-E1.17', 'ACN packet identifier');
    assert.equal(packet.readUInt16BE(16), 0x7000 | 622, 'root PDU flags and length');
    assert.equal(packet.readUInt32BE(18), 4, 'root vector is E1.31 data');
    assert.deepEqual([...packet.subarray(22, 38)], [...cid], 'CID');
    assert.equal(packet.readUInt16BE(38), 0x7000 | 600, 'framing PDU flags and length');
    assert.equal(packet.readUInt32BE(40), 2, 'framing vector is a data packet');
    assert.equal(packet[108], 100, 'priority');
    assert.equal(packet[111], 3, 'sequence');
    assert.equal(packet.readUInt16BE(113), 5, 'universe');
    assert.equal(packet.readUInt16BE(115), 0x7000 | 523, 'DMP PDU flags and length');
    assert.equal(packet.readUInt16BE(123), 513, 'property count is start code plus 512');
    assert.equal(packet[125], 0, 'start code');
    assert.equal(packet[126], 77, 'first slot');
  });

  it('maps universes to the standard multicast address', () => {
    assert.equal(multicastAddress(1), '239.255.0.1', 'universe 1');
    assert.equal(multicastAddress(300), '239.255.1.44', 'universe 300 spans the high byte');
  });

  it('delivers frames over UDP to a unicast host', async () => {
    const receiver = dgram.createSocket('udp4');
    await new Promise((resolve) => receiver.bind(0, '127.0.0.1', resolve));
    const received = new Promise((resolve) => receiver.once('message', resolve));
    const driver = new SacnDriver({ host: '127.0.0.1', universe: 2, port: receiver.address().port });
    await driver.open();
    driver.send(frameWith(11));
    const packet = await received;
    assert.equal(packet.readUInt16BE(113), 2, 'universe reached the receiver');
    assert.equal(packet[126], 11, 'data reached the receiver');
    await driver.close();
    receiver.close();
  });
});
