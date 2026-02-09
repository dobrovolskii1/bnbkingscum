
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, parseEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, BSC_CHAIN_ID } from './constants';
import { KingdomData, GlobalState, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const StatusLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="mt-8 bg-black border border-green-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-sm">
      <div className="text-green-800 mb-2 uppercase tracking-widest text-xs border-b border-green-900 pb-1 flex justify-between">
        <span>System Logs</span>
        <span className="animate-pulse">_ONLINE</span>
      </div>
      {logs.length === 0 && <div className="text-green-900 italic">No activity detected on sub-channels...</div>}
      {logs.map((log) => (
        <div key={log.id} className="mb-1 flex">
          <span className="text-green-900 mr-2">[{log.timestamp}]</span>
          <span className={log.type === 'error' ? 'text-red-500 font-bold' : log.type === 'success' ? 'text-green-400 font-bold' : 'text-green-600'}>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
};

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [viewAddress, setViewAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('0');
  const [kingdom, setKingdom] = useState<KingdomData | null>(null);
  const [globalState, setGlobalState] = useState<GlobalState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasProvider, setHasProvider] = useState<boolean>(true);
  const [copyStatus, setCopyStatus] = useState<string>('COPY_URL');
  // Added state variables for input fields
  const [buyAmount, setBuyAmount] = useState<string>('0.01');
  const [winChance, setWinChance] = useState<string>('50');
  const [gemsToSell, setGemsToSell] = useState<string>('0');

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (!window.ethereum) {
      setHasProvider(false);
      addLog('WARNING: Web3 Provider not detected in Sandbox.', 'error');
    } else {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          setViewAddress(accounts[0]);
          refreshData(accounts[0]);
        }
      });
    }
    fetchGlobal();
  }, []);

  const fetchGlobal = async () => {
    try {
      const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const gs = await contract.getGlobalState();
      setGlobalState({ totalDeposited: gs.totalDeposited, totalKings: Number(gs.totalKings), deploymentTime: gs.deploymentTime, totalDeposits: Number(gs.totalDeposits) });
    } catch (e) { console.error(e); }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setHasProvider(false);
      return addLog('CRITICAL: Provider blocked by sandbox. Use manual copy below.', 'error');
    }
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`ACCESS_GRANTED: ID ${accounts[0].substring(0, 10)}...`, 'success');
      await refreshData(accounts[0]);
    } catch (err: any) { 
      addLog(`AUTH_REJECTED: ${err.message}`, 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopyStatus('COPIED!');
    setTimeout(() => setCopyStatus('COPY_URL'), 2000);
  };

  const refreshData = async (addr: string) => {
    if (!isAddress(addr)) return;
    try {
      const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
      const bal = await provider.getBalance(addr);
      setBalance(formatEther(bal));
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const kd = await contract.getKingdom(addr);
      setKingdom({
        gold: Number(kd.gold), gems: Number(kd.gems), perHour: Number(kd.perHour),
        alliesCount: Number(kd.alliesCount), alliesEarned: Number(kd.alliesEarned),
        claimTime: Number(kd.claimTime), battleTime: Number(kd.battleTime),
      });
      addLog(`SYNC_COMPLETE: Node ${addr.substring(0, 8)}`, 'info');
    } catch (err: any) { addLog(`SYNC_ERROR: ${err.message}`, 'error'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('AUTH_REQUIRED', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      await tx.wait();
      addLog(`CONFIRMED: ${methodName}`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) { addLog(`COMMAND_FAILED: ${err.message}`, 'error'); }
    finally { setLoading(false); }
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();

  return (
    <div className="min-h-screen matrix-bg p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-5xl w-full">
        
        {/* Connection Troubleshooting (Sandbox Issue) */}
        {!hasProvider && (
          <div className="mb-8 p-6 border-2 border-red-500 bg-red-950/40 text-red-500 rounded relative shadow-[0_0_30px_rgba(255,0,0,0.3)]">
            <div className="font-black mb-3 flex items-center gap-2 text-xl">
              <span className="animate-pulse">🛑</span> METAMASK_CONNECTION_BLOCKED
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
              <div className="space-y-3">
                <p className="font-bold text-white uppercase">Способ 1 (Рекомендуемый):</p>
                <p>Найдите в самом верху интерфейса (над этим сайтом) иконку со стрелочкой <span className="bg-green-500 text-black px-1 font-bold">↗</span></p>
                <div className="border border-red-900 p-2 bg-black/40">
                  <div className="text-[10px] text-red-900 mb-1 italic">Схема верхней панели:</div>
                  <div className="flex justify-between items-center opacity-80">
                    <span className="text-gray-600">Preview | Code</span>
                    <span className="text-green-500 flex gap-2">🔄 📄 <span className="bg-red-500 text-black px-1 font-bold animate-bounce">↗ ЖМИ СЮДА</span></span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-bold text-white uppercase">Способ 2 (Ручной):</p>
                <p>Скопируйте ссылку ниже и вставьте её в новую вкладку вашего браузера:</p>
                <div className="flex gap-2">
                  <input 
                    readOnly 
                    value={window.location.href} 
                    className="flex-1 bg-black border border-red-900 p-2 text-[10px] overflow-hidden text-ellipsis whitespace-nowrap"
                  />
                  <button 
                    onClick={copyUrl}
                    className="px-4 bg-red-500 text-black font-black hover:bg-white transition-all whitespace-nowrap"
                  >
                    {copyStatus}
                  </button>
                </div>
                <p className="text-[9px] opacity-60">После открытия в новой вкладке MetaMask увидит сайт и кнопка "UPLINK" заработает.</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-green-500/30 pb-6 gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-black text-green-500 tracking-tighter drop-shadow-[0_0_12px_rgba(0,255,0,0.6)]">
              KINGDOM_COMMANDER_V3
            </h1>
            <div className="flex items-center gap-2 mt-1 text-green-800 text-[10px] font-mono font-bold tracking-widest uppercase">
              <span className={`w-2 h-2 rounded-full ${account ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></span>
              {account ? 'Status: Secure' : 'Status: Isolated'}
            </div>
          </div>
          
          <button 
            onClick={connectWallet}
            disabled={loading}
            className={`px-8 py-4 border-2 rounded font-black transition-all duration-300 ${account ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-green-500 border-green-500 text-black'} hover:shadow-[0_0_30px_rgba(0,255,0,0.5)] disabled:opacity-50 min-w-[220px]`}
          >
            {loading ? 'WAITING...' : account ? `ID: ${account.substring(0, 10)}...` : 'UPLINK_TO_METAMASK'}
          </button>
        </header>

        {/* Scanner */}
        <section className="mb-8 p-6 hacker-border bg-black/80 relative shadow-[0_0_15px_rgba(0,255,0,0.1)]">
          <div className="absolute top-0 left-0 bg-green-500 text-black text-[9px] px-2 font-black">SCANNER_UNIT_v3.2</div>
          <div className="flex flex-col md:flex-row gap-4">
            <input 
              type="text" 
              placeholder="PASTE_TARGET_ADDRESS_HERE..."
              value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="flex-1 bg-black border border-green-900 p-4 text-green-400 font-mono focus:border-green-500 focus:outline-none placeholder:text-green-900/50"
            />
            <button 
              onClick={() => refreshData(viewAddress)} 
              className="px-10 bg-green-900/40 text-green-500 border border-green-500 font-black hover:bg-green-500 hover:text-black transition-colors"
            >
              QUERY_NODE
            </button>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'BNB_RESERVES', value: Number(balance).toFixed(4), unit: 'BNB' },
            { label: 'KINGDOM_GOLD', value: kingdom?.gold || 0, unit: 'AU' },
            { label: 'ROYAL_GEMS', value: kingdom?.gems || 0, unit: 'DMND' },
            { label: 'MINE_YIELD', value: kingdom?.perHour || 0, unit: '/HR' }
          ].map((stat, i) => (
            <div key={i} className="hacker-border p-4 bg-green-500/5 group hover:bg-green-500/10 transition-all cursor-default">
              <div className="text-green-900 text-[9px] font-bold mb-1 group-hover:text-green-500 uppercase">{stat.label}</div>
              <div className="text-2xl font-black text-green-400">{stat.value} <span className="text-[10px] text-green-800 uppercase">{stat.unit}</span></div>
            </div>
          ))}
        </div>

        {/* Interaction Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="hacker-border p-6 bg-black/60 relative group">
            {!account && <div className="absolute inset-0 bg-black/90 z-20 flex items-center justify-center text-red-500 font-black text-xs uppercase animate-pulse">Access Locked</div>}
            <div className="absolute -top-3 left-4 bg-black px-2 text-green-500 text-xs font-bold border border-green-900 uppercase">Finance</div>
            <label className="text-[9px] text-green-800 font-bold block mb-1 uppercase">Value (BNB)</label>
            <input type="text" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} className="w-full bg-black border border-green-900 p-2 text-green-400 text-sm mb-4" />
            <button onClick={() => executeTx('buyGold', [ethers.ZeroAddress], parseEther(buyAmount))} className="w-full py-3 bg-green-500 text-black font-black text-xs uppercase">Buy Gold</button>
          </div>

          <div className="hacker-border p-6 bg-black/60 relative group">
            {!account && <div className="absolute inset-0 bg-black/90 z-20 flex items-center justify-center text-red-500 font-black text-xs uppercase">Locked</div>}
            <div className="absolute -top-3 left-4 bg-black px-2 text-green-500 text-xs font-bold border border-green-900 uppercase">War</div>
            <label className="text-[9px] text-green-800 font-bold block mb-1 uppercase">Win Chance %</label>
            <input type="number" value={winChance} onChange={e => setWinChance(e.target.value)} className="w-full bg-black border border-green-900 p-2 text-green-400 text-sm mb-4" />
            <button onClick={() => executeTx('battle', [winChance])} disabled={!isOwnAccount} className="w-full py-3 bg-red-600 text-black font-black text-xs uppercase">Launch Attack</button>
          </div>

          <div className="hacker-border p-6 bg-black/60 relative group">
            {!account && <div className="absolute inset-0 bg-black/90 z-20 flex items-center justify-center text-red-500 font-black text-xs uppercase">Locked</div>}
            <div className="absolute -top-3 left-4 bg-black px-2 text-green-500 text-xs font-bold border border-green-900 uppercase">Vault</div>
            <label className="text-[9px] text-green-800 font-bold block mb-1 uppercase">Gems to Sell</label>
            <input type="number" value={gemsToSell} onChange={e => setGemsToSell(e.target.value)} className="w-full bg-black border border-green-900 p-2 text-green-400 text-sm mb-4" />
            <button onClick={() => executeTx('sellGems', [gemsToSell])} disabled={!isOwnAccount} className="w-full py-3 border border-red-500 text-red-500 font-black text-xs uppercase">Execute Payout</button>
          </div>
        </div>

        <StatusLog logs={logs} />
        
        <footer className="mt-12 text-center text-green-900 font-mono text-[10px] tracking-widest uppercase py-8 opacity-40">
           [TERMINAL_READY] // {new Date().toLocaleTimeString()}
        </footer>

      </div>
    </div>
  );
}
