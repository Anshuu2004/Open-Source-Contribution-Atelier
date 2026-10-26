import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressRing } from "./ProgressRing";

const meta = {
  title: "Components/ProgressRing",
  component: ProgressRing,
  tags: ["autodocs"],
  args: {
    percentage: 50,
    size: 80,
    color: "#6c63ff",
  },
  argTypes: {
    percentage: {
      control: { type: "range", min: 0, max: 100, step: 1 },
      description: "Progress percentage from 0 to 100.",
    },
    size: {
      control: { type: "number", min: 40, max: 200, step: 10 },
      description: "Width and height of the ring in pixels.",
    },
    color: {
      control: "color",
      description: "Color of the progress arc.",
    },
    label: {
      control: "text",
      description: "Optional text displayed inside the ring.",
    },
  },
} satisfies Meta<typeof ProgressRing>;

export default meta;
type Story = StoryObj<typeof meta>;

const withPercentageLabel = (
  percentage: number,
  args: Partial<Story["args"]> = {},
): Story => ({
  args: {
    ...args,
    percentage,
    label: `${percentage}%`,
  },
  render: (args) => (
    <ProgressRing
      {...args}
      label={args.label} />
  ),
});

export const Default: Story = {
  render: (args) => (
    <ProgressRing
      {...args}
      label={args.label} />
  ),
};

export const Empty: Story = withPercentageLabel(0);

export const Complete: Story = withPercentageLabel(100);

export const Small: Story = withPercentageLabel(50, { size: 48 });

export const Medium: Story = withPercentageLabel(50, { size: 80 });

export const Large: Story = withPercentageLabel(50, { size: 120 });

export const WithLabel: Story = {
  args: { percentage: 65, label: "65%" },
};

export const WithoutLabel: Story = {
  args: { percentage: 65, label: undefined },
};

export const Static: Story = withPercentageLabel(50);

export const Animated: Story = {
  ...withPercentageLabel(50),
  render: (args) => {
    const size = args.size ?? 80;
    const percentage = args.percentage ?? 0;
    const circumference = 2 * Math.PI * ((size - 8) / 2);
    const initialOffset =
      circumference - (percentage / 100) * circumference;

    return (
      <>
        <style>
          {`
            @keyframes progress-ring-story-animation {
              from { stroke-dashoffset: ${circumference}px; }
              to { stroke-dashoffset: ${initialOffset}px; }
            }

            .progress-ring-story-animated .progress-ring__progress {
              animation: progress-ring-story-animation 2s ease-in-out infinite alternate;
            }

            @media (prefers-reduced-motion: reduce) {
              .progress-ring-story-animated .progress-ring__progress {
                animation: none;
              }
            }
          `}
        </style>
        <div className="progress-ring-story-animated">
          <ProgressRing
            {...args}
            label={args.label} />
        </div>
      </>
    );
  },
};

export const DarkMode: Story = {
  ...withPercentageLabel(70),
  decorators: [
    (Story) => (
      <div
        style={{
          background: "#1f2937",
          color: "#f9fafb",
          padding: "24px",
          display: "inline-flex",
          borderRadius: "8px",
        }}
      >
        <Story />
      </div>
    ),
  ],
};