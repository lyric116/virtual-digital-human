import React from 'react';
import { render, screen } from '@testing-library/react';
import AvatarComposerPanel from './AvatarComposerPanel';
import { getAvatarProfile } from './appHelpers';

const testCopy = {
  bubble1: 'user bubble',
  bubble2: 'assistant bubble',
  inputTag: 'input',
  inputPlaceholder: 'type here',
  replayViewing: 'replay',
  recording: 'recording',
  sending: 'sending',
  readyToChat: 'ready',
  sessionInteractionHint: 'hint',
  stopRecording: 'stop',
  startRecording: 'start',
  submitText: 'submit',
};

function renderAvatarPanel(overrides = {}) {
  return render(
    <AvatarComposerPanel
      activeMessage={1}
      assistantAudioRef={{ current: null }}
      avatarProfile={getAvatarProfile('companion_female_01')}
      avatarMouthState="closed"
      avatarSpeechState="idle"
      canSubmitText
      handleMicAction={jest.fn()}
      inputText="hello"
      latestAssistantMessage={{ content_text: 'assistant reply' }}
      liveTranscriptText=""
      onInputChange={jest.fn()}
      recordingDurationMs={0}
      recordingState="idle"
      replayLocked={false}
      submitText={jest.fn()}
      t={testCopy}
      textSubmitState="idle"
      userAvatarId="female"
      {...overrides}
    />,
  );
}

test('renders companion A through Live2D with fallback in jsdom', () => {
  renderAvatarPanel();

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(screen.getByTestId('user-avatar')).toHaveAttribute('data-user-avatar-id', 'female');
  expect(assistantSurface.querySelector('[data-live2d-state="fallback"]')).toBeInTheDocument();
  expect(assistantSurface.querySelector('[data-avatar-fallback-profile="companion"]')).toBeInTheDocument();
  expect(screen.getByTestId('assistant-avatar-stage-note')).toHaveStyle({
    '--assistant-stage-note-left': '49%',
    '--assistant-stage-note-top': '15%',
    '--assistant-stage-note-left-md': '49%',
    '--assistant-stage-note-top-md': '30%',
  });
});

test('renders Xiaozhi through Live2D with the coach fallback surface in jsdom', () => {
  renderAvatarPanel({ avatarProfile: getAvatarProfile('coach_male_01') });

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(assistantSurface.querySelector('[data-live2d-state="fallback"]')).toBeInTheDocument();
  expect(assistantSurface.querySelector('[data-avatar-fallback-profile="coach"]')).toBeInTheDocument();
  expect(screen.getByTestId('assistant-avatar-stage-note')).toHaveStyle({
    '--assistant-stage-note-left': '55%',
    '--assistant-stage-note-top': '13%',
    '--assistant-stage-note-left-md': '47%',
    '--assistant-stage-note-top-md': '23%',
  });
});

test('renders any avatar profile through Live2D when the profile provides model config', () => {
  renderAvatarPanel({
    avatarProfile: {
      ...getAvatarProfile('coach_male_01'),
      renderKind: 'live2d',
      live2dCorePath: '/live2d/live2dcubismcore.min.js',
      live2dModelPath: '/live2d/chitose/chitose.model3.json',
      live2dFitOptions: {
        logicalHeight: 4.52,
        centerX: 1.16,
        centerY: 0.28,
        offsetX: 0,
        offsetY: 0,
      },
    },
  });

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(assistantSurface.querySelector('[data-live2d-state="fallback"]')).toBeInTheDocument();
});

test('renders the male user avatar when requested', () => {
  renderAvatarPanel({
    userAvatarId: 'male',
  });

  expect(screen.getByTestId('user-avatar')).toHaveAttribute('data-user-avatar-id', 'male');
});

test('pins both speech bubbles to explicit widths so avatar containers do not shrink them', () => {
  renderAvatarPanel();

  expect(screen.getByTestId('user-bubble').className).toContain('w-[220px]');
  expect(screen.getByTestId('user-bubble').className).toContain('md:w-[236px]');
  expect(screen.getByTestId('assistant-bubble').className).toContain('w-[220px]');
  expect(screen.getByTestId('assistant-bubble').className).toContain('md:w-[236px]');
});
