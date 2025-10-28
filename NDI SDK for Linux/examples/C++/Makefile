ifeq ($(NDILIB),)
  CC     ?= gcc
  NDILIB := $(shell perl -e '@_=split/-/,"$(shell $(CC) -dumpmachine)"; $$"="-"; if (scalar @_ > 3) { print "@_[0,2,3]" } else { print "@_" }')
endif

BMDSDK := NDIlib_Send_BMD/BMDSDK/Linux

PROJECTS := \
	NDIlib_DynamicLoad \
	NDIlib_Find \
	NDIlib_FreeAudio \
	NDIlib_Genlock \
	NDIlib_Recv \
	NDIlib_Recv_Audio_16bpp \
	NDIlib_Recv_AVSync \
	NDIlib_Recv_FrameSync \
	NDIlib_Recv_FrameSync_Audio \
	NDIlib_Recv_FrameSync_resend \
	NDIlib_Recv_FrameSync_timing \
	NDIlib_Recv_Multichannel \
	NDIlib_Recv_PNG \
	NDIlib_Recv_PTZ \
	NDIlib_Recv_WebControl \
	NDIlib_Routing \
	NDIlib_Send_10bit \
	NDIlib_Send_16bit \
	NDIlib_Send_Audio \
	NDIlib_Send_Audio_16bpp \
	NDIlib_Send_Benchmark \
	NDIlib_Send_Benchmark_8K \
	NDIlib_Send_BMD \
	NDIlib_Send_Capabilities \
	NDIlib_Send_H264 \
	NDIlib_Send_HEVC \
	NDIlib_Send_Latency \
	NDIlib_Send_PNG \
	NDIlib_Send_Video \
	NDIlib_Send_Video_Advanced \
	NDIlib_Send_Video_and_Audio \
	NDIlib_Send_Video_Async \
	NDIlib_Send_Video_Async_Completions \
	NDIlib_Send_VirtualPTZ \
	NDIlib_Tally_Echo

.PHONY: all
all:
	@if [ ! -f ../../lib/libndi.so ] && [ ! -f ../../lib/$(NDILIB)/libndi.so ]; then \
		echo libndi.so not found: $(NDILIB) >&2; \
		false; \
	fi
	-@for proj in $(PROJECTS); do \
		if [ -d $$proj ]; then \
			if [ -f ../../lib/libndi.so ]; then \
				$(MAKE) -C $$proj -f ../Makefile.proj NDILIB=; \
			else \
				$(MAKE) -C $$proj -f ../Makefile.proj NDILIB=$(NDILIB); \
			fi \
		fi \
	done

.PHONY: clean
clean:
	-@for proj in $(PROJECTS); do \
		if [ -d $$proj ]; then \
			$(MAKE) -C $$proj -f ../Makefile.proj clean; \
		fi \
	done
