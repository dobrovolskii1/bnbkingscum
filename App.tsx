
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
  
  // Interaction states
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [buyAmount, setBuyAmount] = useState<string>('0.01');
  const [winChance, setWinChance] = useState<string>('50');
  const [gemsToSell, setGemsToSell] = useState<string>('100');
  const [placeLevel, setPlaceLevel] = useState<string>('1');

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (!window.ethereum) {
      setHasProvider(false);
      addLog('WARNING: Web3 Provider missing. Site restricted to VIEW_ONLY.', 'error');
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
      return addLog('CRITICAL: Provider blocked. Please use the arrow button to open in new tab.', 'error');
    }
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`ACCESS_GRANTED: Welcome back, Commander.`, 'success');
      await refreshData(accounts[0]);
    } catch (err: any) { 
      addLog(`AUTH_REJECTED: ${err.message}`, 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const refreshData = async (addr: string) => {
    if (!isAddress(addr)) return;
    try {
      const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
      const bal = await provider.getBalance(addr);
      setBalance(formatEther(bal));
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const kd = await contract.getKingdom(addr);
      
      // The smart contract returns tiles as an array of 360 uint8
      const tilesArray = Array.from(kd.tiles).map(t => Number(t));

      setKingdom({
        gold: Number(kd.gold), gems: Number(kd.gems), perHour: Number(kd.perHour),
        alliesCount: Number(kd.alliesCount), alliesEarned: Number(kd.alliesEarned),
        claimTime: Number(kd.claimTime), battleTime: Number(kd.battleTime),
        tiles: tilesArray
      });
      addLog(`SYNC_COMPLETE: Kingdom metadata for ${addr.substring(0, 8)} retrieved.`, 'info');
    } catch (err: any) { addLog(`SYNC_ERROR: ${err.message}`, 'error'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('AUTH_REQUIRED: Connect wallet to execute commands.', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      addLog(`TX_PENDING: Requesting block validation...`, 'info');
      await tx.wait();
      addLog(`SUCCESS: ${methodName} executed.`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) { 
      addLog(`FAILED: ${err.message}`, 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();

  return (
    <div className="min-h-screen matrix-bg p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-6xl w-full">
        
        {/* Connection Troubleshooting */}
        {!hasProvider && (
          <div className="mb-8 p-6 border-2 border-red-500 bg-red-950/40 text-red-500 rounded relative shadow-[0_0_20px_rgba(255,0,0,0.2)]">
            <div className="font-black mb-2 text-lg">⚠️ SANDBOX_ISOLATION_DETECTED</div>
            <p className="text-xs font-mono">
              Браузерное расширение (MetaMask) не может получить доступ к этой странице, так как она открыта во внутреннем окне редактора. 
              Нажмите на иконку <span className="bg-red-500 text-black px-1 font-bold">↗</span> (справа сверху в панели управления) 
              для запуска в новой вкладке.
            </p>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-10 border-b border-green-500/20 pb-8 gap-6">
          <div>
            <h1 className="text-5xl font-black text-green-500 tracking-tighter drop-shadow-[0_0_15px_rgba(0,255,0,0.4)]">
              KINGDOM_COMMANDER_V3
            </h1>
            <p className="text-green-800 font-bold text-[10px] tracking-widest uppercase mt-2">
              Blockchain Asset Management Interface // BSC-MAINNET
            </p>
          </div>
          
          <button 
            onClick={connectWallet}
            disabled={loading}
            className={`px-10 py-5 border-2 rounded font-black transition-all ${account ? 'border-green-500 text-green-500 bg-green-500/5' : 'bg-green-500 text-black border-green-500'} hover:scale-105 active:scale-95 disabled:opacity-50`}
          >
            {loading ? 'PROCESSING...' : account ? `CONNECTED: ${account.substring(0, 12)}...` : 'UPLINK_TO_METAMASK'}
          </button>
        </header>

        {/* Scanner Input */}
        <section className="mb-10">
          <div className="flex flex-col md:flex-row gap-4 hacker-border p-2 bg-black/40">
            <input 
              type="text" 
              placeholder="ENTER_WALLET_ADDRESS_TO_SCAN..."
              value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="flex-1 bg-transparent border-none p-4 text-green-400 font-mono focus:ring-0 placeholder:text-green-900/50"
            />
            <button 
              onClick={() => refreshData(viewAddress)} 
              className="px-10 py-3 bg-green-900/20 text-green-500 border border-green-500/50 hover:bg-green-500 hover:text-black font-black uppercase transition-all"
            >
              SCAN_REGION
            </button>
          </div>
        </section>

        {/* Stats & Global */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <div className="hacker-border p-5 bg-green-500/5">
            <div className="text-[9px] text-green-800 font-black mb-1 uppercase">Gold_Reserves</div>
            <div className="text-3xl font-black text-green-400">{kingdom?.gold || 0} <span className="text-xs text-green-900">AU</span></div>
          </div>
          <div className="hacker-border p-5 bg-green-500/5">
            <div className="text-[9px] text-green-800 font-black mb-1 uppercase">Treasury_Gems</div>
            <div className="text-3xl font-black text-green-400">{kingdom?.gems || 0} <span className="text-xs text-green-900">DMND</span></div>
          </div>
          <div className="hacker-border p-5 bg-green-500/5">
            <div className="text-[9px] text-green-800 font-black mb-1 uppercase">Production_Rate</div>
            <div className="text-3xl font-black text-green-400">+{kingdom?.perHour || 0} <span className="text-xs text-green-900">/HR</span></div>
          </div>
          <div className="hacker-border p-5 bg-green-500/5">
            <div className="text-[9px] text-green-800 font-black mb-1 uppercase">Wallet_Balance</div>
            <div className="text-3xl font-black text-green-400">{Number(balance).toFixed(3)} <span className="text-xs text-green-900">BNB</span></div>
          </div>
        </div>

        {/* THE VISUAL MAP (Interactive Grid) */}
        <section className="mb-10 hacker-border bg-black/80 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-green-500 text-black text-[10px] px-3 py-1 font-black">KINGDOM_TACTICAL_MAP</div>
          <p className="text-[10px] text-green-900 font-bold mb-4 uppercase tracking-tighter">
            Select a sector (tile) to build or upgrade structure. Green = Occupied, Dark = Available.
          </p>
          
          <div className="grid grid-cols-12 sm:grid-cols-18 md:grid-cols-20 gap-1 overflow-x-auto pb-4 max-h-[400px]">
            {kingdom?.tiles ? kingdom.tiles.map((level, id) => (
              <button
                key={id}
                onClick={() => setSelectedTile(id)}
                className={`w-full aspect-square border text-[7px] flex items-center justify-center transition-all hover:scale-110 relative group ${
                  selectedTile === id ? 'border-white ring-2 ring-white/50 z-10' : 
                  level > 0 ? 'bg-green-500 border-green-400 text-black font-black' : 'bg-black/80 border-green-900/30 text-green-900/40'
                }`}
              >
                {level > 0 ? level : id}
                <div className="hidden group-hover:block absolute -top-8 bg-black border border-green-500 p-1 text-[8px] whitespace-nowrap z-20 pointer-events-none">
                   ID: {id} | LVL: {level}
                </div>
              </button>
            )) : (
              <div className="col-span-full h-40 flex items-center justify-center text-green-900 italic animate-pulse font-mono">
                WAITING_FOR_SATELLITE_LINK... (Refresh data if empty)
              </div>
            )}
          </div>
        </section>

        {/* COMMAND PANELS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Construction Panel */}
          <div className="hacker-border p-6 bg-black/60 relative">
            <div className="absolute -top-3 left-4 bg-black px-2 text-green-500 text-xs font-bold border border-green-900 uppercase">Engineer_Core</div>
            {!isOwnAccount && <div className="absolute inset-0 bg-black/90 z-20 flex items-center justify-center text-red-500 font-black text-xs uppercase text-center p-4">Unauthorized: Connect Wallet</div>}
            
            <div className="space-y-4">
              <div className="p-3 border border-green-900 bg-green-900/5">
                <span className="text-[10px] text-green-800 uppercase font-black block mb-1">Target Sector</span>
                <span className="text-xl font-black text-green-400">{selectedTile !== null ? `TILE_ID_${selectedTile}` : 'SELECT_ON_MAP'}</span>
              </div>

              {selectedTile !== null && (kingdom?.tiles[selectedTile] || 0) > 0 ? (
                <div className="space-y-2">
                   <p className="text-[10px] text-green-900 italic">Structure detected. Authorization for upgrade requested.</p>
                   <button 
                    onClick={() => executeTx('upgradeBuilding', [selectedTile])}
                    className="w-full py-4 bg-green-500 text-black font-black uppercase hover:bg-white transition-all shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                  >
                    UPGRADE_STRUCTURE
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-green-900 uppercase font-bold block mb-1">Target Level</label>
                    <input type="number" min="1" max="100" value={placeLevel} onChange={e => setPlaceLevel(e.target.value)} className="w-full bg-black border border-green-900 p-2 text-green-400 text-sm" />
                  </div>
                  <button 
                    disabled={selectedTile === null}
                    onClick={() => executeTx('placeBuildings', [[selectedTile], parseInt(placeLevel)])}
                    className="w-full py-4 bg-green-900 text-green-400 border border-green-500 font-black uppercase hover:bg-green-500 hover:text-black transition-all disabled:opacity-20"
                  >
                    CONSTRUCT_NEW
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Finance Panel */}
          <div className="hacker-border p-6 bg-black/60 relative">
            <div className="absolute -top-3 left-4 bg-black px-2 text-green-500 text-xs font-bold border border-green-900 uppercase">Vault_Access</div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] text-green-800 font-black block mb-1 uppercase">Buy Gold Reserves (BNB)</label>
                <div className="flex gap-2">
                  <input type="text" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} className="flex-1 bg-black border border-green-900 p-2 text-green-400 text-sm" />
                  <button onClick={() => executeTx('buyGold', [ethers.ZeroAddress], parseEther(buyAmount))} className="px-6 py-2 bg-green-500 text-black font-black text-xs">BUY</button>
                </div>
              </div>
              <div className="pt-4 border-t border-green-900/30">
                <label className="text-[10px] text-red-900 font-black block mb-1 uppercase">Liquidate Gems</label>
                <div className="flex gap-2">
                  <input type="number" value={gemsToSell} onChange={e => setGemsToSell(e.target.value)} className="flex-1 bg-black border border-red-900 p-2 text-red-400 text-sm" />
                  <button onClick={() => executeTx('sellGems', [parseInt(gemsToSell)])} className="px-6 py-2 border border-red-500 text-red-500 font-black text-xs hover:bg-red-500 hover:text-black transition-all">SELL</button>
                </div>
              </div>
            </div>
          </div>

          {/* War Theater */}
          <div className="hacker-border p-6 bg-black/60 relative">
            <div className="absolute -top-3 left-4 bg-black px-2 text-red-500 text-xs font-bold border border-red-900 uppercase">Offensive_Op</div>
            <div className="space-y-4">
              <label className="text-[10px] text-green-900 font-black block mb-1 uppercase tracking-tighter">Adjust Strategy (Risk: {winChance}%)</label>
              <input type="range" min="1" max="100" value={winChance} onChange={e => setWinChance(e.target.value)} className="w-full accent-green-500" />
              <button 
                onClick={() => executeTx('battle', [parseInt(winChance)])} 
                className="w-full py-6 bg-red-600 text-black font-black text-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(255,0,0,0.4)]"
              >
                LAUNCH_ATTACK
              </button>
              <p className="text-[8px] text-center text-red-900 uppercase italic">Success grants gold based on production rate and risk.</p>
            </div>
          </div>

        </div>

        <StatusLog logs={logs} />
        
        <footer className="mt-16 text-center text-green-900 font-mono text-[9px] tracking-[0.3em] uppercase opacity-40 border-t border-green-900/20 py-10">
           [TERMINAL_END] // ALL_SYSTEMS_GO // {new Date().toLocaleTimeString()}
        </footer>

      </div>
    </div>
  );
}
