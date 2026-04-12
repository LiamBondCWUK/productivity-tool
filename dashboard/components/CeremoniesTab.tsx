interface CeremoniesTabProps {
  embedUrl: string;
}

export function CeremoniesTab({ embedUrl }: CeremoniesTabProps) {
  return (
    <div className="h-full p-4 flex flex-col min-h-0">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Sprint Operations</h2>
          <p className="text-xs text-gray-400 mt-1">
            Embedded ceremony dashboard for standup, planning, refinement, demo, and retro prep.
          </p>
        </div>
        <a
          href={embedUrl}
          target="_blank"
          rel="noreferrer"
          className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
        >
          Open in New Tab
        </a>
      </div>

      <div className="flex-1 min-h-0 rounded border border-gray-700 overflow-hidden">
        <iframe
          title="Ceremony Dashboard"
          src={embedUrl}
          className="w-full h-full bg-gray-950"
        />
      </div>
    </div>
  );
}
