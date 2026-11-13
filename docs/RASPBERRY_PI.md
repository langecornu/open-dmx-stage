# Raspberry Pi: a lighting box for the venue

Run Open DMX Stage on a Raspberry Pi with the USB-DMX cable plugged into it, and control the show from a phone, tablet or
laptop on the same network. Once set up, the Pi starts the app by itself when it is powered on.

A **Raspberry Pi 4** (2 GB or more) is comfortable; a Pi 3 also works. The Pi only builds DMX frames and serves the app:
the screens and song analysis run on the device you control it from. A browser on the Pi itself is usable on a Pi 4
but not needed.

You need: the Pi with its official power supply (the USB-DMX cable draws power from it), a microSD card of 16 GB or more
(a good brand: the show saves after every change), the USB-DMX cable, and a computer to prepare the card.

## 1. Prepare the card

1. Install [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your computer.
2. Choose your Pi model and **Raspberry Pi OS Lite (64-bit)**. The app needs 64-bit, because Node.js 24 is published
   for 64-bit ARM.
3. In the settings (the gear, or **Edit settings**):
   - **Hostname:** a short name, for example `stage`. Devices will reach the Pi as `stage.local`.
   - **Username and password:** your choice. The commands below use `$USER`, so any name works.
   - **Wireless LAN:** your network, if the Pi will not be on a cable.
   - **Services:** turn on SSH with a password.
4. Write the card, put it in the Pi, and power it on. Give it a minute or two the first time.

From your computer, connect to it:

```bash
ssh <your user>@stage.local
```

## 2. Install Node.js and Git

On the Pi:

```bash
sudo apt update && sudo apt full-upgrade -y
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs git
node --version    # 24.15 or newer
```

## 3. Install the app

```bash
cd ~
git clone https://github.com/langecornu/open-dmx-stage.git
cd open-dmx-stage
npm ci
npm run build
```

`npm ci` installs everything, including the serial port library (prebuilt for 64-bit ARM). Building takes a minute or two
on a Pi 4.

## 4. Let the app use the USB-DMX cable

Plug the cable in. The serial port belongs to the `dialout` group:

```bash
sudo usermod -aG dialout $USER
ls /dev/serial/by-id/
```

The second command shows the cable's lasting name, for example
`usb-FTDI_FT232R_USB_UART_A10KXXXX-if00-port0`. Prefer it to `/dev/ttyUSB0`, which can change when other USB devices are
plugged in. Log out and back in (or reboot) so the group change takes effect.

**Check the cable before the show.** A passive cable such as the DSD TECH SH-RS09B is timed by the Pi itself (see
[ADR 0003](adr/0003-passive-usb-cables-are-software-timed.md)). With a par light on address 1 that uses 4 channels:

```bash
npm run dmx:ramp -- --list
npm run dmx:ramp -- --driver open-dmx --port /dev/serial/by-id/usb-FTDI_... --channels 4
```

The light should fade up smoothly with no flicker. If it flickers on the Pi, an active adapter (an ENTTEC DMX USB Pro
style one) or an Art-Net node removes the problem.

## 5. Start it on boot

```bash
sudo cp deploy/open-dmx-stage@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now open-dmx-stage@$USER
systemctl status open-dmx-stage@$USER
```

The service starts the app on boot, restarts it if it stops, and lets it write only its data folder. Its log:

```bash
journalctl -u open-dmx-stage@$USER -f
```

Settings go in `~/open-dmx-stage/.env`, one `NAME=value` per line, only the ones you change (for example
`HTTPS_PORT=8443`; `.env.example` lists them all, but do not copy it whole: it sets development values). Then
`sudo systemctl restart open-dmx-stage@$USER`. Most people need none: choose the output on the **Output** screen and the
app remembers it, and each venue remembers its own.

## 6. Use it

On a phone, tablet or laptop on the same network:

- **`https://stage.local:4443`**: everything, including **Follow the music** (the microphone) and MIDI. The first time,
  accept the warning about the connection not being private: the certificate is made by the app. **Settings > Phones
  and tablets** shows the addresses and the fingerprint to check. See [ADR 0009](adr/0009-https-with-a-self-signed-certificate.md).
- **`http://stage.local:4000`**: everything except the microphone and MIDI, with no warning.

Some Android phones do not find `.local` names; use the Pi's address instead (shown by `hostname -I` on the Pi, and in
**Settings**). Ask your router to always give the Pi the same address ("DHCP reservation") so it does not change between
shows.

Then, on **Output**, choose **USB-DMX cable** and the port from step 4.

## Updating

```bash
cd ~/open-dmx-stage
cp -r server/data ~/open-dmx-stage-backup-$(date +%Y%m%d)   # your shows, settings and certificate
git pull
npm ci
npm run build
sudo systemctl restart open-dmx-stage@$USER
```

Shows saved by an older version are upgraded when the new one opens them.

## Backups

Everything you make is in `~/open-dmx-stage/server/data`: the open show (`project.json`), saved shows (`shows/`), the
output setting, the Anthropic key if you saved one (`secrets.json`), and the certificate (`tls/`). Copy the folder
somewhere safe, or use **File > Export to a file** for one show.

## Security

The app has no login: anyone on the same network can control the lights, and start AI shows billed to a saved key. Use
it on a network you trust (the venue's own Wi-Fi with a password, or the Pi's own hotspot), never open it to the
internet, and set `HOST=127.0.0.1` in `.env` if only a browser on the Pi itself should reach it.

## Troubleshooting

| Symptom                                      | Fix                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `stage.local` does not open                  | Use the Pi's address (`hostname -I` on the Pi). Some Android phones and Windows PCs do not resolve `.local` names.                   |
| The service will not start                   | `journalctl -u open-dmx-stage@$USER -n 50` shows why. Check `node --version` is 24.15 or newer and the app is in `~/open-dmx-stage`. |
| `Permission denied` on the serial port       | Your user is not in `dialout` yet: run step 4 and reboot. The service adds the group by itself.                                      |
| The cable is not listed on **Output**        | Re-plug it and check `ls /dev/serial/by-id/`. Use a powered USB hub if the Pi's power supply is not the official one.                |
| The lights flicker                           | Run the cable check in step 4. A busy Pi or a long USB extension can upset a passive cable; prefer an active adapter or Art-Net.     |
| The secure address warns again after a while | The certificate changed: the Pi got a new address, or a year passed. Check the new fingerprint in **Settings** and accept it again.  |
