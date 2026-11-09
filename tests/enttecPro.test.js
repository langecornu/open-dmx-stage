// Tests for the ENTTEC DMX USB Pro packet framing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEnttecProPacket } from '../server/clients/enttecProDriver.js';

describe('buildEnttecProPacket', () => {
  it('frames 512 slots with start/label/length/start-code/end bytes', () => {
    const frame = new Uint8Array(512);
    frame[0] = 255;
    const packet = buildEnttecProPacket(frame);
    assert.equal(packet.length, 518, '5 header bytes + 512 data + 1 end byte');
    assert.deepEqual(
      [...packet.slice(0, 5)],
      [0x7e, 6, 0x01, 0x02, 0],
      'header: SOM, label 6, length 513 LSB/MSB, start code',
    );
    assert.equal(packet[5], 255, 'first DMX slot follows the start code');
    assert.equal(packet[517], 0xe7, 'packet ends with the end-of-message byte');
  });
});
