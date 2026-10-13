"""Rebuild the CC0 game bank: python build-audio.py SOURCE_DIRECTORY.
Requires numpy, scipy, soundfile. Source URLs and input names are in sounds/sources.json.
Freesound inputs are the publicly linked HQ MP3s; Kenney packs are extracted as sci-fi/ and impact/.
"""
import sys,json,hashlib,pathlib,math
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly,butter,sosfilt
ROOT=pathlib.Path(sys.argv[1]); OUT=pathlib.Path(__file__).resolve().parents[1]/'public/sounds'; SR=32000
OUT.mkdir(parents=True,exist_ok=True); records={}
def read(file,start=0,duration=None):
 x,sr=sf.read(ROOT/file,always_2d=True); x=x.mean(axis=1); x=x[int(start*sr):None if duration is None else int((start+duration)*sr)]
 x=resample_poly(x,SR//math.gcd(sr,SR),sr//math.gcd(sr,SR));return x-x.mean()
def filt(x,lo=45,hi=10000):
 return sosfilt(butter(2,[lo,hi],btype='bandpass',fs=SR,output='sos'),x)
def level(x,rms=.18):
 return x*min(rms/max(1e-8,np.sqrt(np.mean(x*x))),.84/max(1e-8,np.max(np.abs(x))))
def loop(x,seconds=.08):
 n=min(int(seconds*SR),len(x)//4); a=np.linspace(0,1,n);return np.r_[x[n:-n],x[-n:]*(1-a)+x[:n]*a]
def trim(x,maxlen=2):
 nonzero=np.flatnonzero(np.abs(x)>.008*max(np.max(np.abs(x)),1e-8));x=x[max(0,int(nonzero[0])-64):min(len(x),int(nonzero[-1])+400,int(nonzero[0])+int(SR*maxlen))] if len(nonzero) else x
 n=min(240,len(x)//8);x[:32]*=np.linspace(0,1,32);x[-n:]*=np.linspace(1,0,n);return x
def save(name,x,inputs,processing):
 x=level(x);sf.write(OUT/(name+'.wav'),x,SR,subtype='PCM_16')
 records[name]={'file':name+'.wav','inputs':inputs,'processing':processing,'duration':round(len(x)/SR,4),'peak':round(float(np.max(np.abs(x))),4),'sha256':hashlib.sha256((OUT/(name+'.wav')).read_bytes()).hexdigest()}
for name in ['engine-idle','engine-low','engine-mid','engine-high']:
 x=filt(read(name+'.mp3',.12),45,6500);save(name,loop(x),[name+'.mp3'],'Mono, DC removal, 32 kHz, bandpass 45–6500 Hz, 80 ms loop crossfade, level matched')
for name,start,duration in [('coast',12,15),('wind',4,15)]:
 save(name,loop(filt(read(name+'.mp3',start,duration),80,8000),1),[name+'.mp3'],f'Mono extract {start}–{start+duration}s, bandpass, 1s loop crossfade, level matched')
# Isolate the sustained rubber foley, avoiding the old car recording and its engine contamination.
x=read('skid-foley.mp3'); frame=SR//4; powers=np.array([np.mean(x[i:i+frame]**2) for i in range(0,len(x)-frame,frame)])
# Pick a two-second region with sustained energy, not an isolated chirp.
w=8; at=int(np.argmax([np.min(powers[i:i+w]) for i in range(len(powers)-w)]))*frame
save('skid',loop(filt(x[at:at+SR*2],480,6200),.12),['skid-foley.mp3'],f'Sustained rubber foley at {at/SR:.2f}s, 480–6200Hz, 120ms loop crossfade')
for name,source in [('gunshot','gunshot.mp3'),('shotgun','shotgun.mp3')]:
 save(name,trim(filt(read(source),75,11500),1.5),[source],'Mono, trimmed attack/silence, bandpass, 32 kHz, peak headroom')
for name,prefix in [('plasma','laserSmall'),('rail','laserLarge'),('explosion','explosionCrunch'),('shield','forceField'),('metal','impactMetal')]:
 for i in range(3):
  source=f'sci-fi/Audio/{prefix}_{i:03}.ogg';save(f'{name}-{i}',trim(filt(read(source),55,11000)),[source],'Mono, trimmed attack, DC removal, level matched, 32 kHz PCM')
for i in range(3):
 source=f'impact/Audio/impactMetal_medium_{i:03}.ogg';save(f'clank-{i}',trim(filt(read(source))),[source],'Mono, trimmed, bandpass, level matched')
for name,source in [('flame','thrusterFire_000')]:
 file=f'sci-fi/Audio/{source}.ogg';save(name,loop(filt(read(file),120,6500),.12),[file],'Mono, bandpass, 120ms loop crossfade, level matched')
source='sci-fi/Audio/lowFrequency_explosion_000.ogg';save('thump',trim(filt(read(source),40,900),1.2),[source],'Mono, low body layer, trimmed, level matched')
# Original authored synthesis; no third-party inputs. Seeded for reproducible assets.
rng=np.random.default_rng(7319)
t=np.arange(SR*4)/SR
# Continuous irregular arc: band-limited noise, rapid amplitude jitter and a buzzy carrier.
knots=np.arange(0,4.02,.012);jitter=np.interp(t,knots,rng.uniform(.12,1,len(knots)))
carrier=np.sin(2*np.pi*120*t+2*np.sin(2*np.pi*37*t))
arc=filt(rng.normal(size=len(t)),650,7200)*(.22+.78*jitter**2)
arc+=.18*np.tanh(4*carrier)*(.35+.65*jitter)
save('taser',loop(arc,.16),[],'Original seeded electrical arc synthesis: continuous noise, irregular crackle and 120 Hz buzz, seamless crossfade')
for name,duration,base,sweep,decay in [('rail-body',1.4,45,130,4.8),('elimination',1.25,48,85,5.2)]:
 t=np.arange(int(SR*duration))/SR
 # Falling pitch gives a bass-drum strike; upper partials carry the impact on laptop speakers.
 phase=2*np.pi*(base*t+sweep*.025*(1-np.exp(-t/.025)))
 body=(np.sin(phase)+.3*np.sin(2*phase)+.13*np.sin(3*phase))*np.exp(-decay*t)
 crack=filt(rng.normal(size=len(t)),180,5000)*np.exp(-t/.024)*.24
 tail=filt(rng.normal(size=len(t)),60,1300)*np.exp(-t/.19)*(.45 if name=='rail-body' else .12)
 x=(body+crack+tail)*np.minimum(1,t/.002);x[-640:]*=np.linspace(1,0,640)
 save(name,x,[],'Original seeded bass-drum synthesis: falling pitch, audible bass harmonics, transient and short rumble')
x=np.zeros(int(SR*1.8))
for at,freq in [(0,659.255),(.13,987.767)]:
 t=np.arange(len(x)-int(at*SR))/SR
 note=(np.sin(2*np.pi*freq*t)+.16*np.sin(2*np.pi*freq*2*t))*np.exp(-t*4.5)*np.minimum(1,t/.008)
 x[int(at*SR):]+=note
x[-640:]*=np.linspace(1,0,640)
save('round-end',x,[],'Original two-note E5/B5 sine chime, soft attacks, clean decaying harmonics')
manifest={'licence':'CC0-1.0','attributionRequired':False,'licenceUrl':'https://creativecommons.org/publicdomain/zero/1.0/','retrieved':'2026-10-13','notes':'Freesound inputs use the site’s public HQ MP3 previews (lossy), not original WAV downloads. Weapon designs include Kenney synthesized effects and recorded gunfire. Taser, rail body, elimination and round-end cues are original synthesis authored by tools/build-audio.py, released under CC0; their inputs are empty. Skid is recorded rubber foley. RPM anchors are authored game tuning, not measured vehicle RPM.','sources':json.loads((ROOT/'freesound-sources.json').read_text()),'packs':[{'author':'Kenney','url':'https://kenney.nl/assets/sci-fi-sounds','licence':'CC0-1.0'},{'author':'Kenney','url':'https://kenney.nl/assets/impact-sounds','licence':'CC0-1.0'}],'assets':records}
# Only list imported source recordings.
used={v for r in records.values() for v in r['inputs']};manifest['sources']=[s for s in manifest['sources'] if s['name']+'.mp3' in used]
(OUT/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'{len(records)} assets, {sum(p.stat().st_size for p in OUT.glob("*.wav"))/1e6:.2f} MB')
