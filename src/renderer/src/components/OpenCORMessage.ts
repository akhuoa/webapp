import * as vue from 'vue';

// Message of an instance of OpenCOR, i.e. a blocking message with an (optional) progress bar that its components can
// show while they are doing something that takes time (e.g., exporting data to CSV).
// Note: this uses Vue's provide()/inject() methods to ensure that each OpenCOR instance has its own message.

interface IOpenCORMessage {
  show: (message: string, withProgress?: boolean) => void;
  update: (percent: number) => void;
  hide: () => void;
}

interface IOpenCORMessageState {
  visible: vue.Ref<boolean>;
  message: vue.Ref<string>;
  progress: vue.Ref<number | undefined>;
}

const OpenCORMessageKey = Symbol('OpenCORMessage');

export const provideOpenCORMessage = (): IOpenCORMessageState => {
  const visible = vue.ref<boolean>(false);
  const message = vue.ref<string>('');
  const progress = vue.ref<number | undefined>(undefined);

  const show = (newMessage: string, withProgress: boolean = true): void => {
    message.value = newMessage;
    progress.value = withProgress ? 0 : undefined;
    visible.value = true;
  };

  const update = (percent: number): void => {
    progress.value = percent;
  };

  const hide = (): void => {
    visible.value = false;
  };

  vue.provide<IOpenCORMessage>(OpenCORMessageKey, {
    show,
    update,
    hide
  });

  return {
    visible,
    message,
    progress
  };
};

export const useOpenCORMessage = (): IOpenCORMessage => {
  const opencorMessage = vue.inject<IOpenCORMessage | undefined>(OpenCORMessageKey, undefined);

  if (!opencorMessage) {
    throw new Error(
      'useOpenCORMessage() must be called within a component that has provideOpenCORMessage() in its ancestor tree.'
    );
  }

  return opencorMessage;
};
