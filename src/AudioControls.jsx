import { useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { setSound, sound, setMusic, setMusicVolume } from './sound';

export default function AudioControls() {
  const [effects, setEffects] = useState(true), [music, setMusicOn] = useState(false), [volume, setVolume] = useState(30);
  const request = useRef(0);
  useEffect(() => {
    const unlock = () => setSound(effects);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [effects]);
  useEffect(() => () => { request.current++; setMusic(false); }, []);
  async function toggleMusic() {
    const id = ++request.current, next = !music;
    setMusicOn(next);
    const playing = await setMusic(next);
    if (id === request.current) setMusicOn(playing);
  }
  return <div className="audio-controls" aria-label="Controles de audio">
    <div className={`music-controls ${music ? 'music-on' : ''}`}>
      <button className="music-toggle" aria-label={music ? 'Apagar música cumbia' : 'Prender música cumbia'} aria-pressed={music} onClick={toggleMusic} title="Cumbia instrumental chill"><Music2 size={17}/><span>Cumbia</span><i/></button>
      <label className="music-volume"><span className="sr-only">Volumen de la música</span><input aria-label="Volumen de la música" type="range" min="0" max="100" value={volume} onChange={e => { const next = Number(e.target.value); setVolume(next); setMusicVolume(next / 100); }}/><output>{volume}%</output></label>
    </div>
    <button className={`icon-button ${effects ? 'sound-active' : ''}`} aria-label={effects ? 'Silenciar efectos de cartas' : 'Activar efectos de cartas'} aria-pressed={effects} onClick={() => { setSound(!effects); setEffects(!effects); if (!effects) sound('card'); }} title="Efectos de cartas y cantos">{effects ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>
  </div>;
}
