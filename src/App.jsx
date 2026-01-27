import React, { useState, useRef } from 'react';

// CONFIGURAÇÃO
const TEMPO_TESTE = 10000; // 10 segundos por etapa

function App() {
  const [status, setStatus] = useState('OCIOSO'); // OCIOSO, PING, DOWNLOAD, UPLOAD, CONCLUIDO
  const [velocidade, setVelocidade] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const [metricas, setMetricas] = useState({ 
    ping: '--', 
    jitter: '--', 
    download: '--', 
    upload: '--' 
  });

  // Refs para controle de cancelamento
  const abortRef = useRef(null);

  // 1. PING & JITTER
  const medirPingReal = async () => {
    setStatus('PING');
    const leituras = [];
    
    // Faz 8 disparos para ter uma média mais precisa
    for (let i = 0; i < 8; i++) {
      if (abortRef.current?.signal.aborted) return;
      const inicio = performance.now();
      
      try {
        // Busca um arquivo de 0 bytes (apenas cabeçalho)
        await fetch(`https://speed.cloudflare.com/__down?bytes=0&t=${Date.now()}`, { 
          method: 'GET',
          mode: 'cors', 
          cache: 'no-store' 
        });
        
        const fim = performance.now();
        const latencia = fim - inicio;
        // Filtra leituras irreais1ms é erro de cache local
        if (latencia > 0.5) leituras.push(latencia);
        
        setProgresso((i + 1) * 12.5);
      } catch (e) {
        console.warn("Falha no ping:", e);
      }
    }

    if (leituras.length > 0) {
      const minPing = Math.min(...leituras);
      // Jitter: diferença média
      let jitterSum = 0;
      for (let i = 0; i < leituras.length - 1; i++) {
        jitterSum += Math.abs(leituras[i] - leituras[i+1]);
      }
      const jitterCalc = leituras.length > 1 ? (jitterSum / (leituras.length - 1)) : 0;

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

    const loopDownload = async () => {
      if (performance.now() - inicio > TEMPO_TESTE) return;

      try {
        // Baixar pacotes
        const response = await fetch(`https://speed.cloudflare.com/__down?bytes=50000000&t=${Date.now()}`, {
          signal: abortRef.current.signal
        });
        
        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          const tempoAtual = performance.now();
          const duracao = tempoAtual - inicio;

          if (duracao > TEMPO_TESTE) {
            reader.cancel();
            break;
          }
          if (done) break;

          totalBytes += value.length;
          setProgresso((duracao / TEMPO_TESTE) * 100);

          // Atualiza velocímetro (ignorando os primeiros picos  )
          if (duracao > 200) {
            // Cálculo: (Bytes * 8 bits) / (milisegundos / 1000) / 1 milhão = Mbps para medição
            const mbps = ((totalBytes * 8) / (duracao / 1000) / 1000000);
            setVelocidade(mbps.toFixed(0));
          }
        }
        
        // Recursividade: se o arquivo acabou e tem tempo, baixa outro 
        if (performance.now() - inicio < TEMPO_TESTE) await loopDownload();

      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      }
    };

    await loopDownload();
    
    // Média final exata
    const duracaoTotal = (performance.now() - inicio) / 1000;
    const velocidadeFinal = ((totalBytes * 8) / duracaoTotal / 1000000).toFixed(0);
    setMetricas(prev => ({ ...prev, download: velocidadeFinal }));
  };

  // 3. UPLOAD vai funcionar apenas quando estiver render testar de volta 
  const medirUploadReal = async () => {
    setStatus('UPLOAD');
    setVelocidade(0);
    setProgresso(0);

    const inicio = performance.now();
    let totalBytesEnviados = 0;

    // Criar um pacote de dados aleatórios (blob) de 2MB para enviar
    const tamanhoPacote = 2 * 1024 * 1024; 
    const dados = new Uint8Array(tamanhoPacote); 

    // Função que envia um bloco via XHR (para rastrear progresso real)
    const enviarBloco = () => {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        const url = `https://speed.cloudflare.com/__up?t=${Date.now()}`;
        
        xhr.open("POST", url, true);
        
        // Monitora o progresso deste envio específico
        xhr.upload.onprogress = (e) => {
          const tempoAtual = performance.now();
          const duracao = tempoAtual - inicio;
          
          if (duracao > TEMPO_TESTE) {
            xhr.abort();
            return;
          }

          const bytesTotaisAgora = totalBytesEnviados + e.loaded;
          setProgresso((duracao / TEMPO_TESTE) * 100);

          if (duracao > 200) {
            const mbps = ((bytesTotaisAgora * 8) / (duracao / 1000) / 1000000);
            setVelocidade(mbps.toFixed(0));
          }
        };

        xhr.onload = () => {
          totalBytesEnviados += tamanhoPacote;
          resolve(true);
        };
        
        xhr.onerror = () => resolve(true); // Tenta continuar mesmo com erro de rede
        xhr.onabort = () => resolve(false);

        xhr.send(dados);
      });
    };

    // Loop de envio contínuo até dar 10 segundos
    while ((performance.now() - inicio) < TEMPO_TESTE) {
      if (abortRef.current?.signal.aborted) break;
      await enviarBloco();
    }

    // Cálculo final real
    const duracaoFinal = (performance.now() - inicio) / 1000;
    const velocidadeFinal = ((totalBytesEnviados * 8) / duracaoFinal / 1000000).toFixed(0);
    
    setMetricas(prev => ({ ...prev, upload: velocidadeFinal }));
    setVelocidade(0); // Zera o ponteiro no final
  };

  // --- ORQUESTRADOR ---
  const iniciarTeste = async () => {
    if (status !== 'OCIOSO' && status !== 'CONCLUIDO') return;

    // Reset
    abortRef.current = new AbortController();
    setMetricas({ ping: '--', jitter: '--', download: '--', upload: '--' });
    setVelocidade(0);
    setProgresso(0);

    // 1. Ping
    await medirPingReal();
    
    // 2. Download
    await medirDownloadReal();

    // 3. Upload
    await medirUploadReal();

    setStatus('CONCLUIDO');
    setProgresso(100);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col items-center justify-center p-4">
      
      <div className="w-full max-w-3xl bg-[#0a0a0a] border border-zinc-800 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
        
        {/* Barra de Progresso Superior */}
        <div className="absolute top-0 left-0 h-1 bg-blue-600 transition-all duration-100 ease-linear" style={{ width: `${progresso}%` }}></div>

        <h1 className="text-center text-zinc-500 text-[10px] tracking-[0.4em] uppercase mb-10">
          SpeedView Teste de Velocidade Real
        </h1>

        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          
          {/* Velocímetro */}
          <div className="relative w-72 h-72 flex-shrink-0">
             <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="144" cy="144" r="135" stroke="#1a1a1a" strokeWidth="6" fill="none" />
                <circle 
                  cx="144" cy="144" r="135" 
                  stroke={status === 'UPLOAD' ? '#9333ea' : '#2563eb'} 
                  strokeWidth="6" fill="none" 
                  /* Escala visual até 2000Mbps (pode alterar o divisor 2000 para mais se quiser) */
                  strokeDasharray="848" 
                  strokeDashoffset={848 - (848 * (Math.min(velocidade, 2000) / 2000))} 
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                {status === 'PING' ? (
                   <span className="text-2xl font-bold text-zinc-500 animate-pulse">PING...</span>
                ) : (
                   <>
                      <span className="text-7xl font-light tracking-tighter text-white">
                        {status === 'CONCLUIDO' ? 'OK' : velocidade}
                      </span>
                      <span className={`text-xs font-bold tracking-widest mt-2 uppercase ${status === 'UPLOAD' ? 'text-purple-500' : 'text-blue-500'}`}>
                        {status === 'CONCLUIDO' ? 'FINALIZADO' : 'MBPS'}
                      </span>
                   </>
                )}
             </div>
          </div>

          {/* Cards de Métricas */}
          <div className="grid grid-cols-2 gap-4 w-full">
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
          className={`w-full mt-12 py-5 rounded-xl font-black uppercase tracking-[0.2em] transition-all 
            ${status === 'OCIOSO' || status === 'CONCLUIDO'
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20' 
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
        >
          {status === 'OCIOSO' || status === 'CONCLUIDO' ? 'INICIAR TESTE' : 'MEDINDO CONEXÃO...'}
        </button>

      </div>
      <p className="mt-6 text-[10px] text-zinc-700 uppercase tracking-widest"> • Tecnologia React + Vite</p>
    </div>
  );
}

// Componente Card Visual
const Card = ({ label, val, unit, active, color = 'text-white', border = 'border-zinc-800' }) => (
  <div className={`p-5 rounded-2xl border transition-all duration-300 ${active ? `bg-zinc-900 ${border} scale-105 shadow-xl` : 'bg-transparent border-zinc-900/50'}`}>
    <p className="text-[9px] uppercase font-bold text-zinc-500 mb-1">{label}</p>
    <div className="flex items-baseline gap-1">
      <span className={`text-2xl font-bold ${val === '--' ? 'text-zinc-600' : (active || val !== '--' ? color : 'text-white')}`}>
        {val}
      </span>
      <span className="text-[10px] text-zinc-600 font-bold">{unit}</span>
    </div>
  </div>
);

export default App;