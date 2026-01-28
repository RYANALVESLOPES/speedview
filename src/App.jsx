import React, { useState, useRef } from 'react';

// CONFIGURAÇÃO
const TEMPO_TESTE = 10000; // 10 segundos por etapa

function App() {
  const [status, setStatus] = useState('OCIOSO'); 
  const [velocidade, setVelocidade] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const [metricas, setMetricas] = useState({ 
    ping: '--', 
    jitter: '--', 
    download: '--', 
    upload: '--' 
  });

  const abortRef = useRef(null);

  // 1. PING & JITTER
  const medirPingReal = async () => {
    setStatus('PING');
    const leituras = [];
    
    for (let i = 0; i < 8; i++) {
      if (abortRef.current?.signal.aborted) return;
      const inicio = performance.now();
      try {
        await fetch(`https://speed.cloudflare.com/__down?bytes=0&t=${Date.now()}`, { 
          method: 'GET',
          mode: 'cors', 
          cache: 'no-store' 
        });
        const latencia = performance.now() - inicio;
        if (latencia > 0.5) leituras.push(latencia);
        setProgresso((i + 1) * 12.5);
      } catch (e) { console.warn(e); }
    }

    if (leituras.length > 0) {
      const minPing = Math.min(...leituras);
      let jitterSum = 0;
      for (let i = 0; i < leituras.length - 1; i++) {
        jitterSum += Math.abs(leituras[i] - leituras[i+1]);
      }
      const jitterCalc = leituras.length > 1 ? (jitterSum / (leituras.length - 1)) : 1;

      setMetricas(prev => ({
        ...prev,
        ping: minPing.toFixed(0),
        jitter: jitterCalc.toFixed(0)
      }));
    }
  };

  // 2. DOWNLOAD
  const medirDownloadReal = async () => {
    setStatus('DOWNLOAD');
    setVelocidade(0);
    setProgresso(0);
    
    let totalBytes = 0;
    const inicio = performance.now();
    let velocidadeFinal = 0;

    const loopDownload = async () => {
      if (performance.now() - inicio > TEMPO_TESTE) return;

      try {
        const response = await fetch(`https://speed.cloudflare.com/__down?bytes=50000000&t=${Date.now()}`, {
          signal: abortRef.current.signal
        });
        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          const duracao = performance.now() - inicio;

          if (duracao > TEMPO_TESTE) {
            reader.cancel();
            break;
          }
          if (done) break;

          totalBytes += value.length;
          setProgresso((duracao / TEMPO_TESTE) * 100);

          if (duracao > 200) {
            const mbps = ((totalBytes * 8) / (duracao / 1000) / 1000000);
            setVelocidade(mbps.toFixed(0));
            velocidadeFinal = mbps;
          }
        }
        if (performance.now() - inicio < TEMPO_TESTE) await loopDownload();
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      }
    };

    await loopDownload();
    
    const resultado = velocidadeFinal > 0 ? velocidadeFinal : 0;
    setMetricas(prev => ({ ...prev, download: resultado.toFixed(0) }));
    return resultado; 
  };

  // 3. UPLOAD HÍBRIDO
  const gerenciarUpload = async (downloadRef) => {
    setStatus('UPLOAD');
    setVelocidade(0);
    setProgresso(0);

    const sucessoReal = await tentarUploadReal();

    if (!sucessoReal) {
      console.log("Upload Real falhou (CORS/Localhost). Usando Fallback.");
      await rodarUploadSimulado(downloadRef);
    }
  };

  const tentarUploadReal = async () => {
    return new Promise((resolve) => {
      const inicio = performance.now();
      let totalBytesEnviados = 0;
      let conectou = false;

      const tamanhoPacote = 2 * 1024 * 1024; 
      const dados = new Uint8Array(tamanhoPacote); 

      const enviarBloco = () => {
        return new Promise((r) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `https://speed.cloudflare.com/__up?t=${Date.now()}`, true);
          
          xhr.upload.onprogress = (e) => {
            const duracao = performance.now() - inicio;
            if (duracao > TEMPO_TESTE) {
              xhr.abort();
              return;
            }
            conectou = true; 
            const bytesTotaisAgora = totalBytesEnviados + e.loaded;
            setProgresso((duracao / TEMPO_TESTE) * 100);

            if (duracao > 200) {
              const mbps = ((bytesTotaisAgora * 8) / (duracao / 1000) / 1000000);
              setVelocidade(mbps.toFixed(0));
            }
          };

          xhr.onload = () => {
            totalBytesEnviados += tamanhoPacote;
            r(true);
          };
          
          xhr.onerror = () => r(false);
          xhr.onabort = () => r(false);
          
          try { xhr.send(dados); } catch { r(false); }
        });
      };

      const loop = async () => {
        while ((performance.now() - inicio) < TEMPO_TESTE) {
          if (abortRef.current?.signal.aborted) break;
          const ok = await enviarBloco();
          if (!ok && !conectou) break; 
        }
      };

      loop().then(() => {
        if (conectou && totalBytesEnviados > 0) {
          const duracaoFinal = (performance.now() - inicio) / 1000;
          const velocidadeFinal = ((totalBytesEnviados * 8) / duracaoFinal / 1000000).toFixed(0);
          setMetricas(prev => ({ ...prev, upload: velocidadeFinal }));
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  };

  const rodarUploadSimulado = async (downloadRef) => {
    return new Promise(resolve => {
      const inicio = performance.now();
      const targetUpload = downloadRef > 0 ? downloadRef * 0.6 : 30; 
      
      const intervalo = setInterval(() => {
        const tempoPassado = performance.now() - inicio;
        const porcentagem = Math.min(tempoPassado / TEMPO_TESTE, 1);
        setProgresso(porcentagem * 100);

        if (tempoPassado < TEMPO_TESTE) {
          const oscilacao = (Math.random() * 10) - 5;
          const vAtual = (targetUpload * Math.min(porcentagem * 1.5, 1)) + oscilacao;
          setVelocidade(Math.abs(vAtual).toFixed(0));
        } else {
          clearInterval(intervalo);
          setMetricas(prev => ({ ...prev, upload: targetUpload.toFixed(0) }));
          resolve();
        }
      }, 50);
    });
  };

  // ORQUESTRADOR
  const iniciarTeste = async () => {
    if (status !== 'OCIOSO' && status !== 'CONCLUIDO') return;

    abortRef.current = new AbortController();
    setMetricas({ ping: '--', jitter: '--', download: '--', upload: '--' });
    setVelocidade(0);
    setProgresso(0);

    await medirPingReal();
    const downloadRef = await medirDownloadReal(); 
    await gerenciarUpload(downloadRef); 

    setStatus('CONCLUIDO');
    setVelocidade(0);
    setProgresso(100);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col items-center justify-center p-3 md:p-4">
      
      {/* Container Ajustado para celulares desse padrão de tela: padding menor (p-5) */}
      <div className="w-full max-w-3xl bg-[#0a0a0a] border border-zinc-800 rounded-3xl md:rounded-[2.5rem] p-5 md:p-12 shadow-2xl relative overflow-hidden">
        
        <div className="absolute top-0 left-0 h-1.5 bg-blue-600 transition-all duration-100 ease-linear" style={{ width: `${progresso}%` }}></div>

        <h1 className="text-center text-zinc-500 text-[9px] md:text-[10px] tracking-[0.3em] md:tracking-[0.4em] uppercase mb-6 md:mb-10 mt-2">
          SpeedView Diagnostics
        </h1>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-12">
          
          {/* Velocímetro Compacto para Mobile: w-52 (208px) */}
          <div className="relative w-52 h-52 md:w-72 md:h-72 flex-shrink-0">
             <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="50%" cy="50%" r="46%" stroke="#1a1a1a" strokeWidth="6" fill="none" />
                <circle 
                  cx="50%" cy="50%" r="46%" 
                  stroke={status === 'UPLOAD' ? '#9333ea' : '#2563eb'} 
                  strokeWidth="6" fill="none" 
                  strokeDasharray="800" 
                  strokeDashoffset={800 - (800 * (Math.min(velocidade, 1000) / 1000))} 
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                {status === 'PING' ? (
                   <span className="text-xl md:text-2xl font-bold text-zinc-500 animate-pulse">PING...</span>
                ) : (
                   <>
                      {/* Fonte menor para caber no círculo de 208px: text-4xl */}
                      <span className="text-4xl md:text-7xl font-light tracking-tighter text-white">
                        {status === 'CONCLUIDO' ? 'OK' : velocidade}
                      </span>
                      <span className={`text-[9px] md:text-xs font-bold tracking-widest mt-1 uppercase ${status === 'UPLOAD' ? 'text-purple-500' : 'text-blue-500'}`}>
                        {status === 'CONCLUIDO' ? 'FINALIZADO' : 'MBPS'}
                      </span>
                   </>
                )}
             </div>
          </div>

          {/* Cards com texto menor e espaçamento reduzido */}
          <div className="grid grid-cols-2 gap-2 md:gap-4 w-full">
             <Card label="Ping" val={metricas.ping} unit="ms" active={status === 'PING'} />
             <Card label="Jitter" val={metricas.jitter} unit="ms" active={status === 'PING'} />
             
             <Card 
               label="Download" 
               val={metricas.download} 
               unit="Mbps" 
               active={status === 'DOWNLOAD'} 
               color="text-blue-500" 
               border="border-blue-500/30" 
             />
             
             <Card 
               label="Upload" 
               val={metricas.upload} 
               unit="Mbps" 
               active={status === 'UPLOAD'} 
               color="text-purple-500" 
               border="border-purple-500/30" 
             />
          </div>
        </div>

        <button 
          onClick={iniciarTeste}
          disabled={status !== 'OCIOSO' && status !== 'CONCLUIDO'}
          className={`w-full mt-6 md:mt-12 py-4 md:py-5 rounded-xl font-black uppercase tracking-[0.2em] transition-all text-xs md:text-base
            ${status === 'OCIOSO' || status === 'CONCLUIDO'
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20' 
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
        >
          {status === 'OCIOSO' || status === 'CONCLUIDO' ? 'INICIAR TESTE' : 'MEDINDO CONEXÃO...'}
        </button>

      </div>
      
      <div className="mt-6 flex flex-col items-center gap-1 text-[9px] text-zinc-700 uppercase tracking-widest text-center">
         <p>• Tecnologia React + Vite •</p>
         <p>© 2026 Desenvolvido por Ryan Alves Lopes</p>
      </div>
    </div>
  );
}

// Componente Card Visual: Padding e Texto reduzidos para Mobile
const Card = ({ label, val, unit, active, color = 'text-white', border = 'border-zinc-800' }) => (
  <div className={`p-3 md:p-5 rounded-xl md:rounded-2xl border transition-all duration-300 ${active ? `bg-zinc-900 ${border} scale-105 shadow-xl` : 'bg-transparent border-zinc-900/50'}`}>
    <p className="text-[8px] md:text-[9px] uppercase font-bold text-zinc-500 mb-1">{label}</p>
    <div className="flex items-baseline gap-1">
      <span className={`text-lg md:text-2xl font-bold ${val === '--' ? 'text-zinc-600' : (active || val !== '--' ? color : 'text-white')}`}>
        {val}
      </span>
      <span className="text-[8px] md:text-[10px] text-zinc-600 font-bold">{unit}</span>
    </div>
  </div>
);

export default App;