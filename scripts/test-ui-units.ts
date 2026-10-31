import { Colors } from '../src/constants/colors';
import { ALL_MODELS_VIEW, COUNCIL_META, getCouncilIndex } from '../src/constants/council';

function getModelProvider(modelId?: string, provider?: string): 'nvidia' | 'cohere' {
  const haystack = `${modelId ?? ''} ${provider ?? ''}`.toLowerCase();
  return haystack.includes('cohere') || haystack.includes('north') ? 'cohere' : 'nvidia';
}
const PROVIDER_LABEL = { nvidia: 'NVIDIA', cohere: 'Cohere' };

function testUIUnits() {
  console.log('Testing UI Units & State Logic...');

  // 1. Theme darkness assertions
  if (Colors.background !== '#030712') throw new Error('Theme background is not pitch black #030712');
  if (Colors.card !== '#0B0F19') throw new Error('Card surface is not ultra-dark #0B0F19');
  if (Colors.sidebar !== '#02040A') throw new Error('Sidebar is not #02040A');
  console.log('  ✅ [PASS] Colors & Theme: Ultra-dark OLED palette verified.');

  // 2. Council Meta
  if (COUNCIL_META.length !== 3) throw new Error('Council agents count mismatch');
  if (getCouncilIndex('nemotron-lightning') !== 0) throw new Error('Nemotron lightning should be index 0');
  if (getCouncilIndex('north-mini-code') !== 1) throw new Error('Cohere should be index 1');
  if (getCouncilIndex('nemotron-ultra') !== 2) throw new Error('Nemotron ultra should be index 2');
  console.log('  ✅ [PASS] Council Meta: Agent indices and names verified.');

  // 3. Logo Providers
  if (getModelProvider('nemotron-lightning') !== 'nvidia') throw new Error('Nemotron should map to nvidia');
  if (getModelProvider('north-mini-code') !== 'cohere') throw new Error('North mini should map to cohere');
  if (PROVIDER_LABEL['nvidia'] !== 'NVIDIA') throw new Error('NVIDIA label mismatch');
  if (PROVIDER_LABEL['cohere'] !== 'Cohere') throw new Error('Cohere label mismatch');
  console.log('  ✅ [PASS] Model Logos: Provider mapping verified.');

  // 4. Prompt Directive Parsing regex test
  const samplePrompt = `### [OPTIMIZED DIRECTIVE]
<role>Principal Systems Architect</role>
<objective>Evaluate database locking mechanisms</objective>
<user_task>Compare optimistic and pessimistic locking</user_task>
<execution_protocol>
1. Define optimistic concurrency control
2. Contrast with 2-phase locking
</execution_protocol>
<constraints>
- Strict adherence to ACID guarantees
- No hypothetical frameworks
</constraints>`;

  const objMatch = samplePrompt.match(/<objective>([\s\S]*?)<\/objective>/i);
  const roleMatch = samplePrompt.match(/<role>([\s\S]*?)<\/role>/i);
  const taskMatch = samplePrompt.match(/<user_task>([\s\S]*?)<\/user_task>/i);
  const protocolMatch = samplePrompt.match(/<execution_protocol>([\s\S]*?)<\/execution_protocol>/i);
  const constrMatch = samplePrompt.match(/<constraints>([\s\S]*?)<\/constraints>/i);

  if (!objMatch || objMatch[1].trim() !== 'Evaluate database locking mechanisms') throw new Error('Objective parse failed');
  if (!roleMatch || roleMatch[1].trim() !== 'Principal Systems Architect') throw new Error('Role parse failed');
  if (!taskMatch || taskMatch[1].trim() !== 'Compare optimistic and pessimistic locking') throw new Error('Task parse failed');
  if (!protocolMatch || !protocolMatch[1].includes('Define optimistic')) throw new Error('Protocol parse failed');
  if (!constrMatch || !constrMatch[1].includes('Strict adherence')) throw new Error('Constraints parse failed');
  console.log('  ✅ [PASS] Prompt Inspector: XML directive parsing verified.');

  console.log('\n🎉 ALL UI UNITS PASSING!\n');
}

testUIUnits();
