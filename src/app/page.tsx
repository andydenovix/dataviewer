import { SampleDashboard } from '../components/SampleDashboard';
import { FileUpload } from '../components/FileUpload';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-12 bg-slate-50 text-slate-900">
      <div className="z-10 max-w-6xl w-full flex flex-col gap-8 font-sans">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-blue-600">
            DeNovix Data Vault
          </h1>
          <p className="text-lg text-gray-600">
              Manage and analyze your DeNovix UV-Vis, Fluorescence and Cell Counting data.
          </p>
          </div>
          <div className="w-full md:w-auto">
            <FileUpload />
          </div>
        </header>
        
        <SampleDashboard />
        
      </div>
    </main>
  );
}