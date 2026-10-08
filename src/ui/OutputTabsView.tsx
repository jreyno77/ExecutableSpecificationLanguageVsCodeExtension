import { useState } from 'react';
import type { OutputTab } from '../core/OutputTab.js';

export function OutputTabsView({ tabs }: { tabs: OutputTab[] }) {
  const [selectedId, select] = useState(tabs[0]?.id);
  const selected = tabs.find(tab => tab.id === selectedId) ?? tabs[0];
  return <section>
    <div role="tablist" aria-label="Configured outputs">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab"
        data-output-id={tab.id} aria-selected={tab === selected}
        onClick={() => select(tab.id)}>{tab.label}</button>)}
    </div>
    {selected && <pre role="tabpanel" aria-label={selected.label}>{selected.content}</pre>}
  </section>;
}
