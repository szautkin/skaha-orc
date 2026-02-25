export function Header() {
  return (
    <header className="bg-prussian-blue text-white h-14 flex items-center px-6 shadow-md">
      <img src="/skaha-orc.png" alt="Skaha-Orc logo" className="h-8 w-8 mr-3" />
      <div>
        <h1 className="text-lg font-semibold tracking-tight leading-tight">Skaha-Orc</h1>
        <p className="text-[10px] text-gray-300 leading-none">A Skaha Deployment Orchestrator</p>
      </div>
    </header>
  );
}
