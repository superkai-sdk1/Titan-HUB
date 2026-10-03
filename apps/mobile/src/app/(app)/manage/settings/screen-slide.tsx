import { Form, Picker, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost } from '@/components/native-form';
import { haptic } from '@/lib/haptics';
import { SLIDE_DURATIONS, createSlide, deleteSlide, pickAdImage, reorderSlides, updateSlide, useScreenSlides, type ScreenSlide } from '@/lib/screen-api';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Слайд рекламы Titan Menu: карточка (заголовок, текст, QR по ссылке) или картинка. */
export default function ScreenSlideEditor() {
  const { slideId } = useLocalSearchParams<{ slideId?: string }>();
  const slides = useScreenSlides();

  if (slideId && !slides.data) {
    return (
      <FormHost>
        <ProgressView />
      </FormHost>
    );
  }
  const list = slides.data ?? [];
  const original = slideId ? (list.find((s) => s.id === slideId) ?? null) : null;
  return <SlideForm key={original?.id ?? 'new'} original={original} list={list} />;
}

function SlideForm({ original, list }: { original: ScreenSlide | null; list: ScreenSlide[] }) {
  const router = useRouter();
  const kind = original?.kind ?? 'card';
  const [title, setTitle] = useState(original?.title ?? '');
  const [body, setBody] = useState(original?.body ?? '');
  const [link, setLink] = useState(original?.linkUrl ?? '');
  const [imageUrl, setImageUrl] = useState(original?.imageUrl ?? null);
  const [duration, setDuration] = useState(original?.durationSec ?? 10);
  const [active, setActive] = useState(original?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const linkOk = !link.trim() || /^https?:\/\/\S+\.\S+/i.test(link.trim());
  const canSave = kind === 'image' ? !!imageUrl : (title.trim() || body.trim() || link.trim()).length > 0 && linkOk;
  const index = original ? list.findIndex((s) => s.id === original.id) : -1;

  const run = async (action: () => Promise<void>, failure: string, close = true) => {
    haptic.medium();
    setBusy(true);
    try {
      await action();
      haptic.success();
      if (close) router.back();
    } catch (error) {
      haptic.error();
      Alert.alert(failure, errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!canSave) return;
    const fields = {
      imageUrl: kind === 'image' ? imageUrl : null,
      title: kind === 'card' ? title.trim() || null : null,
      body: kind === 'card' ? body.trim() || null : null,
      linkUrl: kind === 'card' ? link.trim() || null : null,
      durationSec: duration,
      isActive: active,
    };
    void run(() => (original ? updateSlide(original.id, fields) : createSlide({ kind, ...fields })), 'Слайд не сохранён');
  };

  const replaceImage = () =>
    void run(
      async () => {
        const url = await pickAdImage();
        if (url) setImageUrl(url);
      },
      'Картинка не загрузилась',
      false,
    );

  const move = (dir: -1 | 1) => {
    if (!original || index < 0) return;
    const next = list.slice();
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item!);
    void run(() => reorderSlides(next.map((s, i) => ({ id: s.id, sortOrder: i }))), 'Порядок не изменился', false);
  };

  const remove = () =>
    original &&
    Alert.alert('Удалить слайд?', 'Он пропадёт с экрана ТВ в течение 20 секунд.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void run(() => deleteSlide(original.id), 'Слайд не удалён') },
    ]);

  return (
    <>
      <EditorToolbar title={kind === 'image' ? 'Картинка' : original ? 'Карточка' : 'Новая карточка'} canSave={canSave} busy={busy} onSave={save} />
      <FormHost>
        <Form>
          {kind === 'image' ? (
            <Section title="Картинка" footer={<Text>Вписывается в панель целиком. Лучше всего широкая, примерно 3:1 (например 1500×500).</Text>}>
              <ActionRow title={busy ? 'Загружаем…' : 'Заменить картинку'} icon="photo" disabled={busy} onPress={replaceImage} />
            </Section>
          ) : (
            <>
              <Section title="Заголовок">
                <FieldRow value={title} placeholder="My Titan — твой клуб в телефоне" autoFocus={!original} maxLength={80} onChange={setTitle} />
              </Section>
              <Section title="Текст">
                <FieldRow value={body} placeholder="Баланс, бонусы и запись на игры" maxLength={240} multiline onChange={setBody} />
              </Section>
              <Section
                title="Ссылка для QR"
                footer={<Text>{linkOk ? 'QR рисуется на экране сам. Без ссылки карточка будет только с текстом.' : 'Нужна ссылка вида https://…'}</Text>}>
                <FieldRow value={link} placeholder="https://…" keyboard="url" maxLength={1000} onChange={setLink} />
              </Section>
            </>
          )}

          <Section title="Показ">
            <Picker
              label="Длительность"
              selection={duration}
              onSelectionChange={(next) => {
                haptic.selection();
                setDuration(Number(next));
              }}
              modifiers={[pickerStyle('menu')]}>
              {(SLIDE_DURATIONS.includes(duration) ? SLIDE_DURATIONS : [...SLIDE_DURATIONS, duration].sort((a, b) => a - b)).map((sec) => (
                <Text key={sec} modifiers={[tag(sec)]}>
                  {`${sec} с`}
                </Text>
              ))}
            </Picker>
            <Toggle label="Показывать на экране" isOn={active} onIsOnChange={setActive} />
          </Section>

          {original && list.length > 1 && (
            <Section title="Порядок" footer={<Text>{`Слайд ${index + 1} из ${list.length}. Перед первым слайдом всегда идёт лента тарифов.`}</Text>}>
              <ActionRow title="Показывать раньше" icon="arrow.up" disabled={busy || index <= 0} onPress={() => move(-1)} />
              <ActionRow title="Показывать позже" icon="arrow.down" disabled={busy || index >= list.length - 1} onPress={() => move(1)} />
            </Section>
          )}

          {original && (
            <Section>
              <ActionRow title="Удалить слайд" icon="trash" destructive disabled={busy} onPress={remove} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
