const fs = require('fs');
const file = 'c:/voicetrace/dashboard/src/components/AnimatedFeatures.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace bright orange with dark chocolate (#5C3425)
content = content.replace(/bg-orange-500/g, 'bg-[#5C3425]');
content = content.replace(/text-orange-500/g, 'text-[#5C3425]');
content = content.replace(/text-orange-600/g, 'text-[#5C3425]');
content = content.replace(/bg-orange-600/g, 'bg-[#4A291D]');
content = content.replace(/border-orange-500/g, 'border-[#5C3425]');
content = content.replace(/border-orange-600/g, 'border-[#4A291D]');

// Replace light orange backgrounds with the peach color (#F4D2BB)
content = content.replace(/bg-orange-100\/80/g, 'bg-[#F4D2BB]/80');
content = content.replace(/bg-orange-100/g, 'bg-[#F4D2BB]');
content = content.replace(/bg-orange-50\/50/g, 'bg-[#F4D2BB]/20');

// Replace orange-900 with #5C3425 (dark chocolate)
// This safely transforms things like border-orange-900/5 into border-[#5C3425]/5
content = content.replace(/orange-900/g, '[#5C3425]');

// Replace orange-200 with peach
content = content.replace(/border-orange-200/g, 'border-[#F4D2BB]');

fs.writeFileSync(file, content);
console.log("Replacements complete.");
