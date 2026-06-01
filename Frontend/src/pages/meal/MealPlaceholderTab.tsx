import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type MealPlaceholderTabProps = {
  title: string;
  description?: string;
};

export default function MealPlaceholderTab({ title, description }: MealPlaceholderTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">This section is coming soon.</p>
      </CardContent>
    </Card>
  );
}
