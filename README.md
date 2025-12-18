# Stereo Conversation Audio Builder

This script converts turn-based mono MP3 files into a single **stereo conversation audio file**, with:

* **Agent audio on the left channel**
* **Customer audio on the right channel**
* Correct conversational timing (silence inserted for the non-speaking party)
* One output file **per conversation folder**

It is designed for contact-centre style conversation simulations and works well as part of an automated workflow (e.g. n8n).

---

## What This Does

Given folders containing files like:

```
audio/
  convo_127/
    20251218093217_..._agent.mp3
    20251218093222_..._customer.mp3
    20251218093227_..._agent.mp3
```

The script will:

1. Sort the files by timestamp
2. Build a timeline where:

   * When the agent speaks, the customer channel is silent
   * When the customer speaks, the agent channel is silent
3. Merge the two timelines into a **stereo MP3**
4. Output one stereo file per folder

---

## Output

Stereo files are written to the `out/` directory:

```
out/
  20251218T095312_convo_127_stereo.mp3
```

* Left channel = Agent
* Right channel = Customer

---

## Requirements

* **Node.js** 18+
* **FFmpeg** (must include `ffmpeg` and `ffprobe` on PATH)

### Install FFmpeg

**macOS**

```bash
brew install ffmpeg
```

**Ubuntu / Debian / Raspberry Pi OS**

```bash
sudo apt update
sudo apt install -y ffmpeg
```

Verify:

```bash
ffmpeg -version
ffprobe -version
```

---

## Folder Structure

```
project/
  script.js
  audio/
    <conversation-folder-1>/
      *_agent.mp3
      *_customer.mp3
    <conversation-folder-2>/
      *_agent.mp3
      *_customer.mp3
  out/
```

Each **subdirectory inside `audio/` is treated as one conversation**.

---

## File Naming Rules

Audio files must:

* Be MP3
* End with:

  * `_agent.mp3`
  * `_customer.mp3`
* Contain a sortable prefix (timestamp recommended)

### Valid examples

```
20251218093217_..._agent.mp3
20251218093222_..._customer.mp3
```

The script sorts files lexicographically, so timestamp prefixes must increase over time.

---

## Usage

From the project root:

```bash
node script.js
```

The script will:

* Process each subdirectory in `audio/`
* Skip folders that do not contain both agent and customer audio
* Create one stereo MP3 per conversation

---

## Behaviour Notes

* Multiple consecutive agent or customer turns are supported
* Silence is inserted automatically for the non-speaking channel
* Conversations are isolated by folder, files are never mixed across folders
* Output filenames include a timestamp to ensure uniqueness

---

## Common Use Cases

* Contact-centre demo audio
* QA and coaching simulations
* n8n workflows with Google Drive
* Stereo audio for analytics or playback systems

---

## Limitations

* Does not validate that turns alternate
* Assumes timestamps reflect intended playback order
* MP3 only (can be changed to WAV in the script if required)

---

## Troubleshooting

### “ffprobe not found”

Ensure FFmpeg is installed and available on PATH.

### Output file extremely large

This script avoids infinite padding. If you modify it, do not use unbounded `apad`.

### Files not detected

Ensure filenames end exactly in `_agent.mp3` or `_customer.mp3`.

---

## License

MIT
