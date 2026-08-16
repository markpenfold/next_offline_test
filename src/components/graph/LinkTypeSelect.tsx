import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { TimelineEvent, LINK_TYPES } from '@/components/omenland/omenTypes';
import classes from './graph.module.css';

type LinkTypeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  color: string;
};

export function LinkTypeSelect({ value, onChange, color }: LinkTypeSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        className={classes.selectTrigger}
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <Select.Value />
        <Select.Icon className={classes.selectIcon}>
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content className={classes.selectContent}>
          <Select.Viewport>
            {Object.values(LINK_TYPES).map((lt) => (
              <Select.Item
                key={lt.id}
                value={lt.id}
                className={classes.selectItem}
              >
                <Select.ItemText>{lt.short}</Select.ItemText>
                <Select.ItemIndicator className={classes.selectItemIndicator}>
                  <Check size={12} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

