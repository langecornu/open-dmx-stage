// Tests for the Open DMX, Art-Net and sACN drivers: byte-level packets, serial sequencing, and UDP loopback.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { describe, it } from 'node:test';

import { ArtNetDriver, buildArtNetPacket } from '../../server/clients/artNetDriver.js';
import { EnttecProDriver } from '../../server/clients/enttecProDriver.js';
import { OpenDmxDriver } from '../../server/clients/openDmxDriver.js';
import { SacnDriver, buildSacnPacket, multicastAddress } from '../../server/clients/sacnDriver.js';

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

// Yields to the event loop instead of waiting real time, so driver loops run fast and deterministically.
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(condition, label) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      assert.fail(`Timed out waiting for: ${label}`);
    }
    await yieldToLoop();
  }
}

const writesOf = (port) => port.calls.filter((call) => call[0] === 'write');

describe('OpenDmxDriver', () => {
  it('opens at 250000 baud 8N2 and sends break, then start code plus 512 slots, every frame', async () => {
    const port = createMockPort();
    let options;
    const driver = new OpenDmxDriver({
      path: '/dev/test',
      sleep: yieldToLoop,
      createPort: async (opts) => {
        options = opts;
        return port;
      },
    });
    await driver.open();
    driver.send(frameWith(200));
    await waitFor(() => writesOf(port).some((call) => call[3] === 200), 'a frame carrying slot 1 = 200');
    await driver.close();
    assert.equal(options.baudRate, 250000, 'DMX512 runs at 250 kbaud');
    assert.equal(options.stopBits, 2, 'DMX512 uses two stop bits');
    const kinds = port.calls.map((call) => call.join(':'));
    assert.deepEqual(kinds.slice(0, 2), ['set:true', 'set:false'], 'a break comes before the data');
    const write = writesOf(port)[0];
    assert.equal(write[1], 513, 'start code plus 512 slots');
    assert.equal(write[2], 0, 'the start code is zero');
    assert.ok(kinds.includes('drain'), 'frames are drained before the next break');
  });

  it('transmits a final blank frame on close so lights do not hold stale values', async () => {
    const port = createMockPort();
    const driver = new OpenDmxDriver({ path: '/dev/test', sleep: yieldToLoop, createPort: async () => port });
    await driver.open();
    driver.send(frameWith(255));
    await waitFor(() => writesOf(port).some((call) => call[3] === 255), 'a frame with slot 1 = 255');
    driver.send(new Uint8Array(512));
    await driver.close();
    const lastWrite = writesOf(port).at(-1);
    assert.equal(lastWrite[3], 0, 'the last frame on the wire is the blank one');
    assert.equal(port.isOpen, false, 'the port is closed afterwards');
  });

  it('reports an error status when the port fails', async () => {
    const port = createMockPort();
    port.set = (_options, done) => done(new Error('device unplugged'));
    const driver = new OpenDmxDriver({ path: '/dev/test', sleep: yieldToLoop, createPort: async () => port });
    await driver.open();
    await waitFor(() => driver.getStatus().error !== null, 'the failure to be reported');
    assert.equal(driver.getStatus().error, 'device unplugged', 'the failure is surfaced');
    assert.equal(driver.getStatus().connected, false, 'a failed driver is not connected');
    await driver.close();
  });
});

describe('EnttecProDriver', () => {
  it('flushes the newest frame and drains before closing, even if the last write was skipped', async () => {
    const port = createMockPort();
    port.writableNeedDrain = true;
    const driver = new EnttecProDriver({ path: '/dev/test', createPort: async () => port });
    await driver.open();
    driver.send(frameWith(99));
    assert.equal(writesOf(port).length, 0, 'send() skips the write while the port is backed up');
    await driver.close();
    const final = writesOf(port)[0];
    assert.equal(final[1], 518, 'a full Pro packet was written on close');
    assert.equal(final[2], 0x7e, 'it starts with the Pro start byte');
    const kinds = port.calls.map((call) => call[0]);
    assert.ok(kinds.indexOf('drain') > kinds.indexOf('write'), 'the port is drained after the final write');
    assert.equal(port.isOpen, false, 'the port is closed afterwards');
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

function createFakeSocket(sendResults) {
  const sent = [];
  return {
    sent,
    on() {},
    once() {},
    off() {},
    bind(_port, done) {
      done();
    },
    setBroadcast() {},
    setMulticastTTL() {},
    send(packet, _port, host, done) {
      sent.push({ length: packet.length, host });
      done(sendResults.shift() ?? null);
    },
    close(done) {
      done();
    },
  };
}

describe('network driver status', () => {
  it('reports not connected while sends fail and recovers when they succeed again', async () => {
    const socket = createFakeSocket([new Error('ENETUNREACH'), null]);
    const driver = new ArtNetDriver({ host: '192.168.1.50', createSocket: () => socket });
    await driver.open();
    driver.send(frameWith(1));
    assert.equal(driver.getStatus().connected, false, 'a failed send is not "connected"');
    assert.equal(driver.getStatus().error, 'ENETUNREACH', 'the cause is reported');
    driver.send(frameWith(1));
    assert.equal(driver.getStatus().connected, true, 'a later successful send clears the error');
    await driver.close();
  });

  it('applies the same status rules to sACN and uses multicast when no host is set', async () => {
    const socket = createFakeSocket([new Error('EHOSTUNREACH')]);
    const driver = new SacnDriver({ universe: 3, createSocket: () => socket });
    await driver.open();
    driver.send(frameWith(1));
    assert.equal(driver.getStatus().connected, false, 'a failed sACN send is not "connected"');
    assert.equal(socket.sent[0].host, '239.255.0.3', 'with no host the destination is the universe multicast address');
    await driver.close();
  });
});

describe('closing a network driver', () => {
  // Regression: closing the socket right after send() dropped the packet, so the blanking frame never left and lights
  // kept the last look when the output was switched, the app was stopped, or the show ended.
  async function lastPacketAfterBlankAndClose(createDriver, readSlot) {
    const receiver = dgram.createSocket('udp4');
    await new Promise((resolve) => receiver.bind(0, '127.0.0.1', resolve));
    const slots = [];
    receiver.on('message', (packet) => slots.push(readSlot(packet)));
    const driver = createDriver(receiver.address().port);
    await driver.open();
    driver.send(frameWith(255));
    await new Promise((resolve) => setTimeout(resolve, 30));
    driver.send(new Uint8Array(512)); // blank, then close straight away, as the output manager does
    await driver.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    receiver.close();
    return slots;
  }

  it('still delivers the final Art-Net blanking frame', async () => {
    const slots = await lastPacketAfterBlankAndClose(
      (port) => new ArtNetDriver({ host: '127.0.0.1', universe: 0, port }),
      (packet) => packet[18],
    );
    assert.deepEqual(slots, [255, 0], 'the full frame and then the blank one both arrived');
  });

  it('still delivers the final sACN blanking frame', async () => {
    const slots = await lastPacketAfterBlankAndClose(
      (port) => new SacnDriver({ host: '127.0.0.1', universe: 1, port }),
      (packet) => packet[126],
    );
    assert.deepEqual(slots, [255, 0], 'the full frame and then the blank one both arrived');
  });

  it('waits for the socket to finish sending before it closes it', async () => {
    const events = [];
    const socket = {
      on() {},
      once() {},
      off() {},
      bind(_port, done) {
        done();
      },
      setBroadcast() {},
      send(_packet, _port, _host, done) {
        events.push('send');
        setTimeout(() => {
          events.push('sent');
          done(null);
        }, 20);
      },
      close(done) {
        events.push('close');
        done();
      },
    };
    const driver = new ArtNetDriver({ host: '127.0.0.1', createSocket: () => socket });
    await driver.open();
    driver.send(frameWith(1));
    driver.send(frameWith(0));
    await driver.close();
    assert.deepEqual(events, ['send', 'send', 'sent', 'sent', 'close'], 'every send finished before the socket closed');
  });

  it('does not hang on close when the network never finishes a send', async () => {
    const socket = {
      on() {},
      once() {},
      off() {},
      bind(_port, done) {
        done();
      },
      setBroadcast() {},
      send() {},
      close(done) {
        done();
      },
    };
    const driver = new ArtNetDriver({ host: '127.0.0.1', createSocket: () => socket });
    await driver.open();
    driver.send(frameWith(1));
    const started = Date.now();
    await driver.close();
    assert.ok(Date.now() - started < 2000, 'close gave up waiting after a short time');
  });
});
