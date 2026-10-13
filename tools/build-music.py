"""Build the small Chill Menu loop from Not Jam's official player OGG.
Usage: python tools/build-music.py SOURCE.ogg
Requires numpy, soundfile, imageio-ffmpeg. No network access during the build.
"""
import pathlib,sys,json,hashlib,subprocess
import numpy as np
import soundfile as sf
import imageio_ffmpeg
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(__file__).resolve().parents[1]/'public/music';out.mkdir(exist_ok=True)
x,sr=sf.read(source,always_2d=True)
# 32 bars at 135 BPM, before the preview's ending fade. Preserve the beat period.
start=round(.48*sr);length=round(32*4*60/135*sr);y=x[start:start+length].copy();n=round(.008*sr)
# Carry the previous cycle's waveform into the first 8ms instead of adding silence.
a=np.linspace(0,1,n)[:,None];y[:n]=x[start+length:start+length+n]*(1-a)+y[:n]*a
y*=.84/np.max(np.abs(y))
import tempfile
with tempfile.TemporaryDirectory() as temp:
 wav=pathlib.Path(temp)/'loop.wav';sf.write(wav,y,sr,subtype='PCM_24')
 for ext,codec,args in [('ogg','libvorbis',['-b:a','96k']),('mp3','libmp3lame',['-b:a','96k','-write_xing','1'])]:
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-y','-i',str(wav),'-map_metadata','-1','-c:a',codec,*args,str(out/f'chill-menu.{ext}')],check=True)
assets={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in out.iterdir() if p.suffix in ['.ogg','.mp3']}
manifest={'title':'Chill Menu','author':'Not Jam','licence':'CC0-1.0','attributionRequired':False,'licenceUrl':'https://creativecommons.org/publicdomain/zero/1.0/','sourcePage':'https://not-jam.itch.io/not-jam-music-pack','sourceAudio':'https://html-classic.itch.zone/html/5506295-1006683/media/ChillMenu.ogg','retrieved':'2026-10-13','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'processing':'32-bar loop at 135 BPM starting at 0.48s and ending before the original fade; 8ms seam blend without changing period; peak 0.84; stereo Vorbis/MP3 at 96kbps. MP3 is a browser fallback, not an additional normal download. Source is the official lossy player OGG.','duration':length/sr,'assets':assets}
(out/'source.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(assets))
