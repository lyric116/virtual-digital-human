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
      {...overrides}
    />,
  );
}

test('renders companion A through Live2D with fallback in jsdom', () => {
  renderAvatarPanel();

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(assistantSurface.querySelector('[data-live2d-state="fallback"]')).toBeInTheDocument();
  expect(assistantSurface.querySelector('[data-avatar-fallback-profile="companion"]')).toBeInTheDocument();
});

test('renders role B through Live2D with the coach fallback surface in jsdom', () => {
  renderAvatarPanel({ avatarProfile: getAvatarProfile('coach_male_01') });

  const assistantSurface = screen.getByTestId('assistant-avatar-surface');
  expect(assistantSurface.querySelector('[data-live2d-state="fallback"]')).toBeInTheDocument();
  expect(assistantSurface.querySelector('[data-avatar-fallback-profile="coach"]')).toBeInTheDocument();
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
