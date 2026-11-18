import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, Screen } from '@/components/shell';
import { Button, IconButton, type ButtonVariant } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Badge, Card, Divider, SectionHeader } from '@/components/ui/layout';
import { Txt } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { goBack } from '@/lib/nav';
import { useAppStore } from '@/store';
import { fonts, makeStyles, useTheme } from '@/theme';

type BillingCycle = 'monthly' | 'yearly';

interface PlanFeature {
  label: string;
  included: boolean;
}

interface PlanSpec {
  id: 'free' | 'pro' | 'max';
  name: string;
  badge: { label: string; variant: 'secondary' | 'default' | 'outline' };
  description: string;
  priceMonthly: string;
  suffixMonthly: string;
  priceYearly: string;
  suffixYearly: string;
  button: { label: string; variant: ButtonVariant; disabled?: boolean };
  highlighted?: boolean;
  features: PlanFeature[];
}

const PLANS: PlanSpec[] = [
  {
    id: 'free',
    name: 'Free',
    badge: { label: 'Current plan', variant: 'secondary' },
    description: 'Try the council on everyday questions.',
    priceMonthly: '£0',
    suffixMonthly: 'forever',
    priceYearly: '£0',
    suffixYearly: 'forever',
    button: { label: 'Your current plan', variant: 'outline', disabled: true },
    features: [
      { label: 'Three free models per question', included: true },
      { label: 'Prompt refiner on every turn', included: true },
      { label: '50 council turns a day', included: true },
      { label: 'Premium models', included: false },
      { label: 'Unlimited consensus', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    highlighted: true,
    badge: { label: 'Most popular', variant: 'default' },
    description: 'For daily research, coding and writing.',
    priceMonthly: '£6.99',
    suffixMonthly: '/ month',
    priceYearly: '£5.59',
    suffixYearly: '/ month · £67 billed yearly',
    button: { label: 'Upgrade to Pro', variant: 'default' },
    features: [
      { label: 'Everything in Free', included: true },
      { label: '500 council turns a day', included: true },
      { label: 'Premium models in every seat', included: true },
      { label: 'Unlimited consensus', included: true },
      { label: 'Priority during peak hours', included: true },
    ],
  },
  {
    id: 'max',
    name: 'Max',
    badge: { label: 'Most requests', variant: 'outline' },
    description: 'For teams of one who live in the council.',
    priceMonthly: '£14.99',
    suffixMonthly: '/ month',
    priceYearly: '£11.99',
    suffixYearly: '/ month · £144 billed yearly',
    button: { label: 'Upgrade to Max', variant: 'outline' },
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'Unlimited council turns', included: true },
      { label: 'Choose the model for each seat', included: true },
      { label: 'Longer answers and memory', included: true },
      { label: 'Early access to new models', included: true },
    ],
  },
];

type CompareValue = string | boolean;

const COMPARE_ROWS: { label: string; values: [CompareValue, CompareValue, CompareValue] }[] = [
  { label: 'Council turns per day', values: ['50', '500', 'Unlimited'] },
  { label: 'Consensus builds', values: ['3 a day', 'Unlimited', 'Unlimited'] },
  { label: 'Conversation memory', values: ['3 turns', '10 turns', '25 turns'] },
  { label: 'Premium models', values: [false, true, true] },
  { label: 'Pick the model per seat', values: [false, false, true] },
  { label: 'Priority support', values: [false, false, true] },
];

function PlanCard({
  plan,
  billing,
  onUpgrade,
}: {
  plan: PlanSpec;
  billing: BillingCycle;
  onUpgrade: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const price = billing === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const suffix = billing === 'yearly' ? plan.suffixYearly : plan.suffixMonthly;

  return (
    <Card style={[styles.planCard, plan.highlighted && { borderWidth: 2, borderColor: colors.primary }]}>
      <View style={styles.planTop}>
        <View style={styles.planHeader}>
          <Txt variant="headline">{plan.name}</Txt>
          <Badge label={plan.badge.label} variant={plan.badge.variant} />
        </View>
        <Txt variant="callout" tone="secondary">
          {plan.description}
        </Txt>
      </View>

      <View style={styles.priceRow}>
        <Txt style={styles.price}>{price}</Txt>
        <Txt variant="caption" tone="secondary">
          {suffix}
        </Txt>
      </View>

      <Button
        label={plan.button.label}
        variant={plan.button.variant}
        disabled={plan.button.disabled}
        fullWidth
        onPress={onUpgrade}
      />

      <Divider />

      <View style={styles.features}>
        {plan.features.map((feat) => (
          <View key={feat.label} style={styles.featureRow}>
            {feat.included ? (
              <Check size={16} color={colors.foreground} strokeWidth={1.75} />
            ) : (
              <X size={16} color={colors.faint} strokeWidth={1.75} />
            )}
            <Txt variant="callout" tone={feat.included ? 'primary' : 'tertiary'} style={styles.flex}>
              {feat.label}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

function CompareCell({ value }: { value: CompareValue }) {
  const styles = useStyles();
  const { colors } = useTheme();

  if (typeof value === 'boolean') {
    return (
      <View style={styles.compareValCol}>
        {value ? (
          <Check size={16} color={colors.foreground} strokeWidth={1.75} />
        ) : (
          <Txt variant="caption" tone="tertiary" style={styles.center}>
            —
          </Txt>
        )}
      </View>
    );
  }

  return (
    <View style={styles.compareValCol}>
      <Txt variant="caption" style={styles.center}>
        {value}
      </Txt>
    </View>
  );
}

export default function PricingScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const showToast = useAppStore((s) => s.showToast);
  const [billing, setBilling] = useState<BillingCycle>('yearly');

  const handleUpgrade = () => {
    haptic.tap();
    showToast("Upgrades aren't available yet — this is a preview.");
  };

  return (
    <Screen
      header={
        <AppHeader
          title="Plans & pricing"
          leading={<IconButton icon={X} label="Close" size={40} onPress={goBack} color={colors.foreground} />}
        />
      }
    >
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + 24, 48) }]}>
        <View style={styles.billing}>
          <Segmented<BillingCycle>
            variant="tabs"
            value={billing}
            onChange={setBilling}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
          <View style={styles.billingMeta}>
            <Badge label="Save 20% yearly" variant="success" />
            <Txt variant="caption" tone="secondary">
              Cancel any time
            </Txt>
          </View>
        </View>

        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} billing={billing} onUpgrade={handleUpgrade} />
        ))}

        <View>
          <SectionHeader title="Compare plans" />
          <Card padded={false} style={styles.compareCard}>
            <View style={[styles.compareRow, { backgroundColor: colors.background }]}>
              <View style={styles.compareLabelCol} />
              <Txt variant="label" tone="secondary" style={[styles.compareValCol, styles.center]}>
                Free
              </Txt>
              <Txt variant="label" tone="secondary" style={[styles.compareValCol, styles.center]}>
                Pro
              </Txt>
              <Txt variant="label" tone="secondary" style={[styles.compareValCol, styles.center]}>
                Max
              </Txt>
            </View>
            {COMPARE_ROWS.map((row) => (
              <View key={row.label}>
                <Divider />
                <View style={styles.compareRow}>
                  <View style={styles.compareLabelCol}>
                    <Txt variant="callout">{row.label}</Txt>
                  </View>
                  <CompareCell value={row.values[0]} />
                  <CompareCell value={row.values[1]} />
                  <CompareCell value={row.values[2]} />
                </View>
              </View>
            ))}
          </Card>
        </View>

        <Txt variant="caption" tone="secondary" style={styles.footnote}>
          {"Prices include VAT. Plans are a preview — upgrades aren't available yet."}
        </Txt>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  scroll: { padding: 16, gap: 20 },
  billing: { gap: 10 },
  billingMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planCard: { gap: 16 },
  planTop: { gap: 4 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  features: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compareCard: { overflow: 'hidden' },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 8 },
  compareLabelCol: { flex: 1.6 },
  compareValCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  footnote: { textAlign: 'center', paddingHorizontal: 8 },
}));
