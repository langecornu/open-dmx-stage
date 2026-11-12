// Tests for the QLC+ (.qxf) importer, including hostile and malformed input.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { convertQlcPlus } from '../../server/services/qlcImporter.js';

const RGBW = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE FixtureDefinition>
<FixtureDefinition xmlns="http://www.qlcplus.org/FixtureDefinition">
 <Manufacturer>Acme</Manufacturer>
 <Model>Wash 7</Model>
 <Channel Name="Red" Preset="IntensityRed"/>
 <Channel Name="Dimmer" Preset="IntensityMasterDimmer"/>
 <Channel Name="Pan" Preset="PositionPan"/>
 <Channel Name="Pan Fine" Preset="PositionPanFine"/>
 <Channel Name="Strobe"><Group Byte="0">Shutter</Group></Channel>
 <Channel Name="Amber LED"><Group Byte="0">Intensity</Group><Colour>Amber</Colour></Channel>
 <Mode Name="Basic">
  <Channel Number="0">Red</Channel>
  <Channel Number="1">Dimmer</Channel>
  <Channel Number="2">Pan</Channel>
  <Channel Number="3">Pan Fine</Channel>
  <Channel Number="4">Strobe</Channel>
  <Channel Number="6">Amber LED</Channel>
 </Mode>
</FixtureDefinition>`;

describe('convertQlcPlus', () => {
  it('maps presets, groups and colours to channel types and keeps channel order', () => {
    const type = convertQlcPlus(RGBW);
    const channels = type.modes[0].channels;
    assert.deepEqual(
      channels.map((channel) => channel.type),
      ['red', 'intensity', 'pan', 'pan-fine', 'strobe', 'other', 'amber'],
      'types follow presets, fine channels (the fine half of pan) and groups',
    );
    assert.equal(channels[5].name, 'Unused', 'a gap in channel numbers becomes an unused slot');
    assert.equal(channels[2].defaultValue, 128, 'pan defaults to centre');
    assert.equal(type.id, 'qlc-acme-wash-7', 'id comes from manufacturer and model');
    assert.equal(type.manufacturer, 'Acme', 'manufacturer is kept');
  });

  it('keeps the value ranges of a channel, with slot colours and directions', () => {
    const spot = `<?xml version="1.0" encoding="UTF-8"?>
<FixtureDefinition xmlns="http://www.qlcplus.org/FixtureDefinition">
 <Manufacturer>Acme</Manufacturer>
 <Model>Spot</Model>
 <Channel Name="Shutter">
  <Group Byte="0">Shutter</Group>
  <Capability Min="0" Max="9">Shutter closed</Capability>
  <Capability Min="10" Max="19">Shutter open</Capability>
  <Capability Min="20" Max="255" Preset="StrobeFastToSlow">Strobe fast to slow</Capability>
 </Channel>
 <Channel Name="Colour">
  <Group Byte="0">Colour</Group>
  <Capability Min="0" Max="9" Preset="ColorMacro" Res1="#FFFFFF">White</Capability>
  <Capability Min="10" Max="19" Preset="ColorMacro" Res1="#ff0000">Red</Capability>
  <Capability Min="20" Max="255">Rotation</Capability>
 </Channel>
 <Channel Name="Zoom"><Group Byte="0">Beam</Group></Channel>
 <Mode Name="Basic">
  <Channel Number="0">Shutter</Channel>
  <Channel Number="1">Colour</Channel>
  <Channel Number="2">Zoom</Channel>
 </Mode>
</FixtureDefinition>`;
    const [shutter, colour, zoom] = convertQlcPlus(spot).modes[0].channels;
    assert.deepEqual(
      shutter.capabilities.map((capability) => [capability.type, capability.from, capability.to, capability.reverse]),
      [
        ['shutter-closed', 0, 9, undefined],
        ['shutter-open', 10, 19, undefined],
        ['strobe', 20, 255, true],
      ],
    );
    assert.equal(colour.type, 'color-wheel');
    assert.deepEqual(
      colour.capabilities.map((capability) => [capability.type, capability.label, capability.color]),
      [
        ['color-slot', 'White', '#ffffff'],
        ['color-slot', 'Red', '#ff0000'],
        ['wheel-rotation', 'Rotation', undefined],
      ],
    );
    assert.equal(zoom.type, 'zoom', 'a beam channel is named for what it does');
  });

  it('rejects input that is not a QLC+ fixture definition', () => {
    assert.throws(() => convertQlcPlus('<foo/>'), /Not a QLC\+ fixture definition/);
    assert.throws(() => convertQlcPlus('just text'), /Not a QLC\+ fixture definition|not valid XML/);
  });

  it('rejects definitions without modes', () => {
    const xml = '<FixtureDefinition><Manufacturer>A</Manufacturer><Model>B</Model></FixtureDefinition>';
    assert.throws(() => convertQlcPlus(xml), /could not be converted/);
  });

  it('does not expand XML entities (no entity-expansion attacks)', () => {
    const xml = `<!DOCTYPE FixtureDefinition [<!ENTITY boom "AAAAAAAAAA">]>
<FixtureDefinition><Manufacturer>&boom;</Manufacturer><Model>M</Model>
<Channel Name="D" Preset="IntensityDimmer"/><Mode Name="1"><Channel Number="0">D</Channel></Mode></FixtureDefinition>`;
    const type = convertQlcPlus(xml);
    assert.ok(!type.manufacturer.includes('AAAAAAAAAA'), 'custom entities must stay unexpanded');
  });
});
